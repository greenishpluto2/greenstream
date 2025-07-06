import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Validates that the input file exists and is an MP4 file.
 */
export function validateInputFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".mp4") {
    throw new Error(`Input file must be an MP4 file. Got: ${ext}`);
  }
}

/**
 * Creates the output directory if it doesn't exist.
 */
export function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Runs FFmpeg command to convert MP4 to HLS format.
 */
export function runFFmpegConversion(options: { inputFile: string; outputDir: string }): void {
  const { inputFile, outputDir } = options;

  console.log(`🎬 Converting ${inputFile} to HLS format...`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log(`🎯 Quality: All qualities (1080p, 720p, 480p)`);

  // FFmpeg command for HLS conversion with 3 quality levels
  const ffmpegCommand = `ffmpeg -i "${inputFile}" -filter_complex "[0:v]split=3[v1][v2][v3]; [v1]scale=w=1920:h=1080[v1out]; [v2]scale=w=1280:h=720[v2out]; [v3]scale=w=854:h=480[v3out]" -map "[v1out]" -c:v:0 libx264 -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k -map "[v2out]" -c:v:1 libx264 -b:v:1 2800k -maxrate:v:1 2996k -bufsize:v:1 4200k -map "[v3out]" -c:v:2 libx264 -b:v:2 1400k -maxrate:v:2 1498k -bufsize:v:2 2100k -map a:0 -c:a aac -b:a:0 192k -ac 2 -map a:0 -c:a aac -b:a:1 128k -ac 2 -map a:0 -c:a aac -b:a:2 96k -ac 2 -f hls -hls_time 10 -hls_list_size 0 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "stream_%v/data%03d.ts" -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" -master_pl_name master.m3u8 stream_%v/playlist.m3u8`;

  try {
    // Change to output directory and run FFmpeg
    process.chdir(outputDir);
    execSync(ffmpegCommand, { stdio: "inherit" });
    console.log("✅ FFmpeg conversion completed successfully!");
  } catch (error) {
    console.error("❌ FFmpeg conversion failed:", error);
    throw error;
  }
}
