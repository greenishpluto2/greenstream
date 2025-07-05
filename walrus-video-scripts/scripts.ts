import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const BLOB_ENDPOINT = `${AGGREGATOR}/v1/blobs`;

// const suiClient = new SuiClient({
//   url: getFullnodeUrl("testnet"),
// });

// const walrusClient = new WalrusClient({
//   network: "testnet",
//   suiClient,
// });

// const keypair = Ed25519Keypair.deriveKeypair(
//   "rhythm call control monkey black climb harvest catalog draft home resist cattle"
// );

interface BlobMapping {
  [filePath: string]: string; // filePath -> blobId
}

interface WalrusCLIResult {
  blobStoreResult: {
    alreadyCertified?: {
      blobId: string;
    };
    newlyCreated?: {
      blobObject: {
        blobId: string;
      };
    };
  };
  path: string;
}

// async function uploadFileViaCLI(filePath: string, assetsDir: string): Promise<string> {
//   try {
//     console.log(`Uploading via CLI: ${filePath}`);
//     const result = execSync(`walrus store "${filePath}" --epochs 2 --json`, {
//       encoding: "utf8",
//       cwd: assetsDir,
//     });

//     const results: WalrusCLIResult[] = JSON.parse(result);
//     const fileResult = results.find((r) => r.path === path.basename(filePath));

//     if (!fileResult) {
//       throw new Error(`No result found for ${filePath}`);
//     }

//     const blobId =
//       fileResult.blobStoreResult.alreadyCertified?.blobId || fileResult.blobStoreResult.newlyCreated?.blobObject.blobId;

//     if (!blobId) {
//       throw new Error(`No blob ID found in result for ${filePath}`);
//     }

//     console.log(`✓ Uploaded ${filePath} -> ${blobId}`);
//     return blobId;
//   } catch (error) {
//     console.error(`Error uploading ${filePath}:`, error);
//     throw error;
//   }
// }

async function uploadMultipleFilesViaCLI(filePaths: string[], assetsDir: string): Promise<BlobMapping> {
  const blobMappings: BlobMapping = {};

  try {
    console.log(`Uploading ${filePaths.length} files via CLI...`);
    const result = execSync(`walrus store ${filePaths.map((p) => `"${p}"`).join(" ")} --epochs 2 --json`, {
      encoding: "utf8",
      cwd: assetsDir,
    });

    const results: WalrusCLIResult[] = JSON.parse(result);

    for (const fileResult of results) {
      const blobId =
        fileResult.blobStoreResult.alreadyCertified?.blobId ||
        fileResult.blobStoreResult.newlyCreated?.blobObject.blobId;

      if (blobId) {
        blobMappings[fileResult.path] = blobId;
        console.log(`✓ Uploaded ${fileResult.path} -> ${blobId}`);
      }
    }

    return blobMappings;
  } catch (error) {
    console.error("Error uploading files via CLI:", error);
    throw error;
  }
}

async function uploadHLSAssetsToWalrus(assetsDir: string): Promise<{
  masterBlobId: string;
  blobMappings: BlobMapping;
}> {
  const blobMappings: BlobMapping = {};
  const assetsPath = path.resolve(assetsDir);

  console.log("Starting HLS assets upload to Walrus via CLI...");

  // Get all stream directories
  const streamDirs = fs
    .readdirSync(assetsPath)
    .filter((item) => fs.statSync(path.join(assetsPath, item)).isDirectory())
    .filter((dir) => dir.startsWith("stream_"));

  console.log(`Found ${streamDirs.length} stream directories: ${streamDirs.join(", ")}`);

  // Collect all .ts segment files for batch upload
  const allSegmentFiles: string[] = [];
  for (const streamDir of streamDirs) {
    const streamPath = path.join(assetsPath, streamDir);
    const files = fs.readdirSync(streamPath);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const relativePath = path.join(streamDir, file);
        allSegmentFiles.push(relativePath);
      }
    }
  }

  // Upload all .ts segment files in batch
  console.log(`Uploading ${allSegmentFiles.length} segment files...`);
  const segmentBlobMappings = await uploadMultipleFilesViaCLI(allSegmentFiles, assetsPath);
  Object.assign(blobMappings, segmentBlobMappings);

  // Collect and update all playlist.m3u8 files
  const allPlaylistFiles: string[] = [];
  const playlistMappings: { [key: string]: string } = {}; // tempPath -> originalPath

  for (const streamDir of streamDirs) {
    const playlistPath = path.join(assetsPath, streamDir, "playlist.m3u8");
    const relativePath = path.join(streamDir, "playlist.m3u8");

    if (fs.existsSync(playlistPath)) {
      console.log(`Processing playlist: ${relativePath}`);

      // Read the playlist content
      let playlistContent = fs.readFileSync(playlistPath, "utf8");

      // Replace .ts file references with blob URLs
      for (const [filePath, blobId] of Object.entries(blobMappings)) {
        if (filePath.startsWith(streamDir + "/") && filePath.endsWith(".ts")) {
          const fileName = path.basename(filePath);
          const blobUrl = `${BLOB_ENDPOINT}/${blobId}`;
          playlistContent = playlistContent.replace(new RegExp(`^${fileName}$`, "gm"), blobUrl);
        }
      }

      // Write updated playlist to temp file
      const tempPlaylistPath = path.join(assetsPath, streamDir, "temp_playlist.m3u8");
      fs.writeFileSync(tempPlaylistPath, playlistContent);

      const relativeTempPath = path.join(streamDir, "temp_playlist.m3u8");
      allPlaylistFiles.push(relativeTempPath);
      playlistMappings[relativeTempPath] = relativePath;
    }
  }

  // Upload all playlist files in a single CLI operation
  if (allPlaylistFiles.length > 0) {
    console.log(`Uploading ${allPlaylistFiles.length} playlist files in batch...`);
    const playlistBlobMappings = await uploadMultipleFilesViaCLI(allPlaylistFiles, assetsPath);

    // Map temp paths back to original paths and clean up temp files
    for (const [tempPath, blobId] of Object.entries(playlistBlobMappings)) {
      const originalPath = playlistMappings[tempPath];
      if (originalPath) {
        blobMappings[originalPath] = blobId;
        console.log(`✓ Uploaded updated ${originalPath} -> ${blobId}`);

        // Clean up temp file
        const fullTempPath = path.join(assetsPath, tempPath);
        if (fs.existsSync(fullTempPath)) {
          fs.unlinkSync(fullTempPath);
        }
      }
    }
  }

  // Update and upload master.m3u8
  const masterPath = path.join(assetsPath, "master.m3u8");
  console.log("Processing master playlist...");

  let masterContent = fs.readFileSync(masterPath, "utf8");

  // Replace playlist.m3u8 references with blob URLs
  for (const [filePath, blobId] of Object.entries(blobMappings)) {
    if (filePath.endsWith("playlist.m3u8")) {
      const streamDir = path.dirname(filePath);
      const blobUrl = `${BLOB_ENDPOINT}/${blobId}`;
      masterContent = masterContent.replace(new RegExp(`^${streamDir}/playlist\\.m3u8$`, "gm"), blobUrl);
    }
  }

  // Write updated master to temp file and upload via CLI
  const tempMasterPath = path.join(assetsPath, "temp_master.m3u8");
  fs.writeFileSync(tempMasterPath, masterContent);

  const masterPlaylistBlodMapping = await uploadMultipleFilesViaCLI([tempMasterPath], assetsPath);

  // Clean up temp file
  fs.unlinkSync(tempMasterPath);
  console.log(`✓ Uploaded updated master.m3u8 -> ${masterPlaylistBlodMapping[tempMasterPath]}`);

  console.log("\n🎉 All HLS assets uploaded to Walrus successfully!");
  console.log(`Master playlist blob ID: ${masterPlaylistBlodMapping[tempMasterPath]}`);
  console.log(`Total files uploaded: ${Object.keys(blobMappings).length + 1}`);

  return {
    masterBlobId: masterPlaylistBlodMapping[tempMasterPath],
    blobMappings,
  };
}

// Example usage
async function main() {
  try {
    const result = await uploadHLSAssetsToWalrus("./assets");
    console.log("\n📋 Upload Summary:");
    console.log(`Master playlist URL: ${BLOB_ENDPOINT}/${result.masterBlobId}`);
    console.log("\nAll blob mappings:");
    for (const [filePath, blobId] of Object.entries(result.blobMappings)) {
      console.log(`${filePath} -> ${BLOB_ENDPOINT}/${blobId}`);
    }
  } catch (error) {
    console.error("Error uploading HLS assets:", error);
  }
}

// Export the function for use in other modules
export { uploadHLSAssetsToWalrus };

// Run if this file is executed directly
if (require.main === module) {
  main();
}
