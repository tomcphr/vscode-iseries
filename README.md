# iSeries Visual Studio Code Extension README

Support for iSeries source code and utilities to make development easier.

## Features

- **RPGLE Language Support**: Full syntax highlighting and language recognition for RPGLE files (`.rpgle` extension)
- **Source Code Upload**: Upload your local RPGLE source code directly to IBM i systems
- **Automatic Upload on Save**: Optionally upload source code automatically when you save files
- **Compile Integration**: Automatically compile source code after uploading to IBM i
- **Error Handling**: View compilation errors with configurable output formats (spoolfile, list, or none)

## Commands

- `Upload Iseries Source` - Manually upload the current RPGLE file to IBM i

## Requirements

- VS Code version 1.108.1 or higher
- Access to an IBM i system for uploading and compiling source code
- Network connectivity to your IBM i server

## Extension Settings

This extension contributes the following settings:

### General Settings

- `iseriesUpload.openUploadedCode`: Open a new editor tab with the processed code that's uploaded to the IBM i (default: `false`)
- `iseriesUpload.uploadOnSave`: Automatically upload source to IBM i on save (default: `false`)
- `iseriesUpload.compile`: Automatically compile source after upload (default: `false`)

### Connection Settings

- `iseriesUpload.server`: The IBM i server address for upload (default: `""`)
- `iseriesUpload.library`: The target library for upload (default: `""`)
- `iseriesUpload.timeout`: Upload timeout in seconds (default: `30`)
- `iseriesUpload.session`: 6-digit session ID to avoid clashing sessions (default: `""`)

### Error Handling

- `iseriesUpload.errors.outputType`: The output type for compile errors (default: `"spoolfile"`)
  - Options: `"spoolfile"`, `"list"`, `"none"`
- `iseriesUpload.severity`: Severity level for compile errors (default: `10`)

## Getting Started

1. Install the extension
2. Configure your IBM i server settings:
   - Set `iseriesUpload.server` to your IBM i server address
   - Set `iseriesUpload.library` to your target library
3. Open a `.rpgle` file in VS Code
4. Use the "Upload Iseries Source" command or enable automatic upload on save

## Usage

### Manual Upload
1. Open a RPGLE file
2. Open the Command Palette (Ctrl+Shift+P)
3. Run "Upload Iseries Source"

### Automatic Upload
1. Set `iseriesUpload.uploadOnSave` to `true` in your settings
2. Save any RPGLE file to automatically upload it to IBM i

### Compilation
- Enable `iseriesUpload.compile` to automatically compile after upload
- Configure error output with `iseriesUpload.errors.outputType`
- Set compilation error severity level with `iseriesUpload.severity`

## Known Issues

- Ensure your IBM i server is accessible and properly configured
- Session conflicts may occur if multiple users don't use unique session IDs

## Release Notes

### 0.0.1

Initial release of iSeries Visual Studio Code Extension with:
- RPGLE language support
- Basic upload functionality
- Compilation integration
- Error handling and reporting