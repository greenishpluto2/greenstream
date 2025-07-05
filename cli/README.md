# GreenStream CLI

A command-line tool to convert MP4 videos to HLS format and upload them to Walrus blob storage.

## Features

- 🎬 Convert MP4 videos to HLS format using FFmpeg
- 🎯 Multiple quality streams (1080p, 720p, 480p) generated automatically
- 🚀 Automatic upload to Walrus blob storage
- 📺 Generate streaming URLs for your videos

## Architecture

The CLI is built with a modular architecture:

```
cli/
├── src/
│   ├── cli.ts      # Main CLI entry point and argument parsing
│   ├── ffmpeg.ts   # FFmpeg conversion logic (includes command)
│   └── upload.ts   # Walrus upload functionality
├── index.ts        # Main library exports
└── package.json    # Project configuration
```

## Prerequisites

- Node.js (v16 or higher)
- FFmpeg installed and available in your PATH
- Walrus CLI installed and configured

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

### Installing Walrus CLI

Follow the instructions at [https://walrus.space/docs/cli](https://walrus.space/docs/cli)

## Installation

1. Clone this repository
2. Navigate to the CLI directory:
   ```bash
   cd cli
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Build the project:
   ```bash
   pnpm build
   ```

5. Install globally (optional):
   ```bash
   pnpm link
   ```

## Usage

### Basic Usage

Convert an MP4 file to HLS and upload to Walrus:

```bash
greenstream video.mp4
```

### Advanced Options

```bash
greenstream <input_file> [options]
```

**Arguments:**
- `input_file` - Path to the input MP4 file

**Options:**
- `-o, --output <dir>` - Output directory for HLS files (default: `./output`)
- `-h, --help` - Show help message

### Examples

```bash
# Convert with default output directory
greenstream my-video.mp4

# Specify custom output directory
greenstream my-video.mp4 --output ./my-streams

# Using short option
greenstream my-video.mp4 -o ./streams
```

### Quality Levels

The tool automatically generates three quality levels:
- **1080p**
- **720p**
- **480p**

## Output

After successful conversion and upload, you'll get:

1. **HLS files** in your output directory:
   ```
   output/
   ├── master.m3u8
   ├── stream_0/          # 1080p stream
   │   ├── playlist.m3u8
   │   ├── data000.ts
   │   ├── data001.ts
   │   └── ...
   ├── stream_1/          # 720p stream
   │   └── ...
   ├── stream_2/          # 480p stream
       └── ...
   ```

2. **Streaming URL** for your video:
   ```
   https://aggregator.walrus-testnet.walrus.space/v1/blobs/<master-blob-id>
   ```

### Project Structure

- **`src/cli.ts`** - Main CLI entry point, argument parsing, and orchestration
- **`src/ffmpeg.ts`** - FFmpeg conversion logic with embedded command
- **`src/upload.ts`** - Walrus upload functionality and HLS processing

## Troubleshooting

### FFmpeg Not Found

Make sure FFmpeg is installed and available in your PATH:

```bash
ffmpeg -version
```

### Walrus CLI Not Found

Ensure the Walrus CLI is installed and configured:

```bash
walrus --version
```

## License

ISC 