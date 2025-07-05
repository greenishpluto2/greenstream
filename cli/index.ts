import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const BLOB_ENDPOINT = `${AGGREGATOR}/v1/blobs`;

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

/**
 * Uploads files to Walrus blob storage using the Walrus CLI.
 *
 * This function executes the `walrus store` command to upload files in batch,
 * with each file being stored for 2 epochs. The function handles both newly
 * created blobs and already certified blobs, mapping file paths to their
 * corresponding blob IDs.
 *
 * @param filePaths - Array of file paths to upload (relative to assetsDir)
 * @param assetsDir - The base directory containing the files to upload
 * @returns Promise<BlobMapping> - Object mapping file paths to their blob IDs
 *
 * @throws {Error} - If the CLI command fails or returns invalid JSON
 *
 * @example
 * ```typescript
 * const mappings = await uploadToWalrus(['file1.ts', 'file2.ts'], './assets');
 * // Returns: { 'file1.ts': 'blob_id_1', 'file2.ts': 'blob_id_2' }
 * ```
 */
async function uploadToWalrus(filePaths: string[], assetsDir: string): Promise<BlobMapping> {
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

/**
 * Gets all stream directories from the assets directory.
 *
 * @param assetsPath - The resolved path to the assets directory
 * @returns Array of stream directory names that start with "stream_"
 */
function getStreamDirectories(assetsPath: string): string[] {
  const streamDirs = fs
    .readdirSync(assetsPath)
    .filter((item) => fs.statSync(path.join(assetsPath, item)).isDirectory())
    .filter((dir) => dir.startsWith("stream_"));

  console.log(`Found ${streamDirs.length} stream directories: ${streamDirs.join(", ")}`);
  return streamDirs;
}

/**
 * Collects all .ts segment files from stream directories.
 *
 * @param streamDirs - Array of stream directory names
 * @param assetsPath - The resolved path to the assets directory
 * @returns Array of relative file paths for .ts segment files
 */
function collectSegmentFiles(streamDirs: string[], assetsPath: string): string[] {
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

  return allSegmentFiles;
}

/**
 * Updates playlist content by replacing .ts file references with blob URLs.
 *
 * @param playlistContent - The original playlist content
 * @param streamDir - The stream directory name
 * @param blobMappings - Mapping of file paths to blob IDs
 * @returns Updated playlist content with blob URLs
 */
function updatePlaylistContent(playlistContent: string, streamDir: string, blobMappings: BlobMapping): string {
  let updatedContent = playlistContent;

  for (const [filePath, blobId] of Object.entries(blobMappings)) {
    if (filePath.startsWith(streamDir + "/") && filePath.endsWith(".ts")) {
      const fileName = path.basename(filePath);
      const blobUrl = `${BLOB_ENDPOINT}/${blobId}`;
      updatedContent = updatedContent.replace(new RegExp(`^${fileName}$`, "gm"), blobUrl);
    }
  }

  return updatedContent;
}

/**
 * Processes and uploads playlist files for all streams.
 *
 * @param streamDirs - Array of stream directory names
 * @param assetsPath - The resolved path to the assets directory
 * @param blobMappings - Current mapping of file paths to blob IDs
 * @returns Updated blob mappings including playlist files
 */
async function processAndUploadPlaylists(
  streamDirs: string[],
  assetsPath: string,
  blobMappings: BlobMapping
): Promise<BlobMapping> {
  const allPlaylistFiles: string[] = [];
  const playlistMappings: { [key: string]: string } = {}; // tempPath -> originalPath

  for (const streamDir of streamDirs) {
    const playlistPath = path.join(assetsPath, streamDir, "playlist.m3u8");
    const relativePath = path.join(streamDir, "playlist.m3u8");

    if (fs.existsSync(playlistPath)) {
      console.log(`Processing playlist: ${relativePath}`);

      // Read and update the playlist content
      let playlistContent = fs.readFileSync(playlistPath, "utf8");
      playlistContent = updatePlaylistContent(playlistContent, streamDir, blobMappings);

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
    const playlistBlobMappings = await uploadToWalrus(allPlaylistFiles, assetsPath);

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

  return blobMappings;
}

/**
 * Processes and uploads the master playlist file.
 *
 * @param assetsPath - The resolved path to the assets directory
 * @param blobMappings - Current mapping of file paths to blob IDs
 * @returns The blob ID of the uploaded master playlist
 */
async function processAndUploadMasterPlaylist(assetsPath: string, blobMappings: BlobMapping): Promise<string> {
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

  const masterPlaylistBlobMapping = await uploadToWalrus([tempMasterPath], assetsPath);

  // Clean up temp file
  fs.unlinkSync(tempMasterPath);
  console.log(`✓ Uploaded updated master.m3u8 -> ${masterPlaylistBlobMapping[tempMasterPath]}`);

  return masterPlaylistBlobMapping[tempMasterPath];
}

/**
 * Uploads HLS assets to Walrus blob storage.
 *
 * This function processes HLS assets by:
 * 1. Collecting all .ts segment files from stream directories
 * 2. Uploading these segment files in batch
 * 3. Collecting and updating all playlist.m3u8 files
 * 4. Uploading these playlist files in batch
 * 5. Updating and uploading the master.m3u8 file
 *
 * The function returns the master blob ID and a mapping of all uploaded file paths
 * to their corresponding blob IDs.
 *
 * @param assetsDir - The base directory containing the HLS assets
 * @returns Promise<{ masterBlobId: string; blobMappings: BlobMapping }> - Object containing the master blob ID and all blob mappings
 *
 * @throws {Error} - If the CLI command fails or returns invalid JSON
 *
 * @example
 * ```typescript
 * const result = await uploadHLSAssetsToWalrus('./assets');
 * console.log(`Master playlist URL: ${BLOB_ENDPOINT}/${result.masterBlobId}`);
 * console.log("\nAll blob mappings:");
 * for (const [filePath, blobId] of Object.entries(result.blobMappings)) {
 *   console.log(`${filePath} -> ${BLOB_ENDPOINT}/${blobId}`);
 * }
 * ```
 */
async function uploadHLSAssetsToWalrus(assetsDir: string): Promise<{
  masterBlobId: string;
  blobMappings: BlobMapping;
}> {
  const blobMappings: BlobMapping = {};
  const assetsPath = path.resolve(assetsDir);

  console.log("Starting HLS assets upload to Walrus...");

  // Get all stream directories
  const streamDirs = getStreamDirectories(assetsPath);

  // Collect and upload all .ts segment files
  const allSegmentFiles = collectSegmentFiles(streamDirs, assetsPath);
  console.log(`Uploading ${allSegmentFiles.length} segment files...`);
  const segmentBlobMappings = await uploadToWalrus(allSegmentFiles, assetsPath);
  Object.assign(blobMappings, segmentBlobMappings);

  // Process and upload playlist files
  await processAndUploadPlaylists(streamDirs, assetsPath, blobMappings);

  // Process and upload master playlist
  const masterBlobId = await processAndUploadMasterPlaylist(assetsPath, blobMappings);

  console.log("\n🎉 All HLS assets uploaded to Walrus successfully!");
  console.log(`Master playlist blob ID: ${masterBlobId}`);
  console.log(`Total files uploaded: ${Object.keys(blobMappings).length + 1}`);

  return {
    masterBlobId,
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
