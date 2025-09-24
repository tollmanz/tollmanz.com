#!/usr/bin/env node

// Load environment variables from .env file
require("dotenv").config();

const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const B2 = require("backblaze-b2");
const mime = require("mime-types");
const crypto = require("crypto");

// Simple color functions using ANSI codes
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  reset: "\x1b[0m",
};

class DeploymentManager {
  constructor(options = {}) {
    this.b2 = null;
    this.bucketId = null;
    this.bucketName = null;
    this.publicDir = path.join(process.cwd(), "public");
    this.cacheFile = path.join(process.cwd(), ".deployment-cache.json");
    this.fileCache = new Map();
    this.dryRun = options.dryRun || false;
    this.force = options.force || false;

    // Load existing cache
    this.loadCache();
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const dryRunPrefix = this.dryRun ? colors.yellow("[DRY RUN] ") : "";
    const forcePrefix = this.force ? colors.red("[FORCE] ") : "";
    const prefix = `${dryRunPrefix}${forcePrefix}[${timestamp}]`;

    switch (type) {
      case "success":
        console.log(colors.green(`${prefix} ✓ ${message}`));
        break;
      case "error":
        console.log(colors.red(`${prefix} ✗ ${message}`));
        break;
      case "warning":
        console.log(colors.yellow(`${prefix} ⚠ ${message}`));
        break;
      case "info":
      default:
        console.log(colors.blue(`${prefix} ℹ ${message}`));
        break;
    }
  }

  async validateEnvironment() {
    this.log("Validating environment variables...");

    const requiredVars = [
      "B2_APPLICATION_KEY_ID",
      "B2_APPLICATION_KEY",
      "B2_BUCKET_NAME",
    ];

    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      if (this.dryRun) {
        this.log(
          `⚠ B2 credentials not configured: ${missing.join(", ")}`,
          "warning"
        );
        this.log(
          "Continuing dry-run without B2 credential validation...",
          "warning"
        );
        this.bucketName = "not-configured";
        return { credentialsAvailable: false };
      } else {
        throw new Error(
          `Missing required environment variables: ${missing.join(", ")}`
        );
      }
    }

    this.bucketName = process.env.B2_BUCKET_NAME;
    this.log(`Using bucket: ${this.bucketName}`, "success");
    return { credentialsAvailable: true };
  }

  async runBuild() {
    this.log("Starting build process...");

    try {
      // Clean public directory first
      if (await fs.pathExists(this.publicDir)) {
        await fs.remove(this.publicDir);
        this.log("Cleaned existing public directory");
      }

      // Run the build command
      execSync("npm run build", {
        stdio: "inherit",
        cwd: process.cwd(),
      });

      this.log("Build completed successfully", "success");

      // Verify build output exists
      if (!(await fs.pathExists(this.publicDir))) {
        throw new Error("Build failed: public directory not found");
      }

      const files = await fs.readdir(this.publicDir);
      if (files.length === 0) {
        throw new Error("Build failed: public directory is empty");
      }

      this.log(`Build output contains ${files.length} items`, "success");
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  async initializeB2() {
    this.log("Initializing Backblaze B2 connection...");

    try {
      this.b2 = new B2({
        applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
        applicationKey: process.env.B2_APPLICATION_KEY,
      });

      const authResponse = await this.b2.authorize();
      this.log("B2 authorization successful", "success");

      // Check if the key is scoped to a specific bucket (restricted key)
      if (
        authResponse.data &&
        authResponse.data.allowed &&
        authResponse.data.allowed.bucketId
      ) {
        // Restricted key - use the bucket ID from the auth response
        this.bucketId = authResponse.data.allowed.bucketId;
        const allowedBucketName = authResponse.data.allowed.bucketName;

        if (allowedBucketName !== this.bucketName) {
          throw new Error(
            `Application key is restricted to bucket '${allowedBucketName}', but trying to deploy to '${this.bucketName}'`
          );
        }

        this.log(
          `Using restricted key for bucket: ${allowedBucketName} (${this.bucketId})`,
          "success"
        );
      } else {
        // Unrestricted key - list buckets to find the target bucket
        this.log("Using unrestricted key, listing buckets...", "info");
        const response = await this.b2.listBuckets();
        const bucket = response.data.buckets.find(
          (b) => b.bucketName === this.bucketName
        );

        if (!bucket) {
          throw new Error(`Bucket '${this.bucketName}' not found`);
        }

        this.bucketId = bucket.bucketId;
        this.log(`Found bucket ID: ${this.bucketId}`, "success");
      }
    } catch (error) {
      throw new Error(`B2 initialization failed: ${error.message}`);
    }
  }

  async getFileHash(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha1").update(content).digest("hex");
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
        this.fileCache = new Map(Object.entries(cache));
        this.log(`Loaded cache with ${this.fileCache.size} entries`);
      }
    } catch (error) {
      this.log(`Failed to load cache: ${error.message}`, "warning");
    }
  }

  saveCache() {
    try {
      const cacheObj = Object.fromEntries(this.fileCache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheObj, null, 2));
      this.log(`Saved cache with ${this.fileCache.size} entries`);
    } catch (error) {
      this.log(`Failed to save cache: ${error.message}`, "warning");
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async getAllFiles(dir, baseDir = dir) {
    const files = [];
    const items = await fs.readdir(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({
          localPath: fullPath,
          remotePath: relativePath.replace(/\\/g, "/"), // Ensure forward slashes for B2
          size: stat.size,
        });
      }
    }

    return files;
  }

  async uploadFile(file) {
    const { localPath, remotePath } = file;

    try {
      // Get upload URL
      const uploadUrlResponse = await this.b2.getUploadUrl({
        bucketId: this.bucketId,
      });

      // Read file content
      const fileContent = await fs.readFile(localPath);

      // Determine content type
      const contentType = mime.lookup(localPath) || "application/octet-stream";

      // Upload file
      await this.b2.uploadFile({
        uploadUrl: uploadUrlResponse.data.uploadUrl,
        uploadAuthToken: uploadUrlResponse.data.authorizationToken,
        fileName: remotePath,
        data: fileContent,
        info: {
          "Content-Type": contentType,
        },
      });

      return true;
    } catch (error) {
      this.log(`Failed to upload ${remotePath}: ${error.message}`, "error");
      return false;
    }
  }

  async deployFiles() {
    const modeText = this.dryRun ? "file analysis" : "file deployment";
    this.log(`Starting ${modeText}...`);

    if (this.dryRun) {
      this.log(
        "🔍 DRY RUN MODE - No files will be uploaded to Backblaze B2",
        "warning"
      );
    }

    if (this.force) {
      this.log(
        "💪 FORCE MODE - All files will be uploaded regardless of cache",
        "warning"
      );
    }

    const files = await this.getAllFiles(this.publicDir);
    this.log(`Found ${files.length} files to process`);

    let uploadCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let totalUploadSize = 0;
    const filesToUpload = [];

    for (const file of files) {
      const hash = await this.getFileHash(file.localPath);
      const cacheKey = file.remotePath;
      const cachedHash = this.fileCache.get(cacheKey);

      // Skip cache check if force mode is enabled
      if (!this.force && cachedHash === hash) {
        this.log(
          `${this.dryRun ? "Would skip" : "Skipping"} unchanged file: ${
            file.remotePath
          }`
        );
        skipCount++;
        continue;
      }

      const sizeText = this.formatFileSize(file.size);
      const uploadAction = this.dryRun ? "Would upload" : "Uploading";
      const forceIndicator =
        this.force && !this.dryRun && cachedHash === hash ? " (forced)" : "";
      this.log(
        `${uploadAction}: ${file.remotePath} (${sizeText})${forceIndicator}`
      );

      if (this.dryRun) {
        // In dry-run mode, simulate successful upload
        this.fileCache.set(cacheKey, hash);
        uploadCount++;
        totalUploadSize += file.size;
        filesToUpload.push({ ...file, sizeText });
        this.log(
          `${this.dryRun ? "Would upload" : "Uploaded"}: ${file.remotePath}`,
          "success"
        );
      } else {
        // Actual upload
        const success = await this.uploadFile(file);

        if (success) {
          this.fileCache.set(cacheKey, hash);
          uploadCount++;
          totalUploadSize += file.size;
          this.log(`Uploaded: ${file.remotePath}`, "success");
        } else {
          errorCount++;
        }
      }
    }

    this.saveCache();

    // Detailed summary
    const summaryPrefix = this.dryRun ? "Dry run" : "Deployment";
    const forceSuffix = this.force ? " (forced)" : "";
    this.log(`${summaryPrefix}${forceSuffix} summary:`, "info");
    this.log(
      `  - ${this.dryRun ? "Would upload" : "Uploaded"}: ${uploadCount} files`,
      uploadCount > 0 ? "success" : "info"
    );
    this.log(
      `  - ${this.dryRun ? "Would skip" : "Skipped"}: ${skipCount} files`,
      "info"
    );
    if (!this.dryRun && errorCount > 0) {
      this.log(`  - Errors: ${errorCount} files`, "error");
    }
    this.log(
      `  - Total ${
        this.dryRun ? "estimated " : ""
      }upload size: ${this.formatFileSize(totalUploadSize)}`,
      "info"
    );

    if (this.dryRun && uploadCount > 0) {
      this.log("📋 Files that would be uploaded:", "info");
      filesToUpload.forEach((file) => {
        this.log(`    • ${file.remotePath} (${file.sizeText})`, "info");
      });
    }

    if (errorCount > 0 && !this.dryRun) {
      throw new Error(`Deployment completed with ${errorCount} errors`);
    }

    const completionMessage = this.dryRun
      ? "🔍 Dry run completed successfully! No files were uploaded."
      : "🎉 Deployment completed successfully!";
    this.log(completionMessage, "success");
  }

  async deploy() {
    try {
      const envValidation = await this.validateEnvironment();
      await this.runBuild();

      // Handle B2 initialization based on mode and credential availability
      if (!this.dryRun) {
        // Production deployment - require valid credentials
        await this.initializeB2();
      } else if (envValidation.credentialsAvailable) {
        // Dry-run mode with credentials - attempt validation but don't fail on errors
        this.log("Validating Backblaze B2 credentials...", "info");
        try {
          const tempB2 = new B2({
            applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
            applicationKey: process.env.B2_APPLICATION_KEY,
          });
          const authResponse = await tempB2.authorize();

          // Check if the key is scoped to a specific bucket (restricted key)
          if (
            authResponse.data &&
            authResponse.data.allowed &&
            authResponse.data.allowed.bucketId
          ) {
            // Restricted key - validate bucket name matches
            const allowedBucketName = authResponse.data.allowed.bucketName;

            if (allowedBucketName !== this.bucketName) {
              this.log(
                `⚠ Application key is restricted to bucket '${allowedBucketName}', but trying to deploy to '${this.bucketName}'`,
                "warning"
              );
              this.log(
                "Continuing dry-run with bucket name mismatch...",
                "warning"
              );
            } else {
              this.log(
                "✓ B2 credentials and restricted bucket validated successfully",
                "success"
              );
            }
          } else {
            // Unrestricted key - try to list buckets
            const response = await tempB2.listBuckets();
            const bucket = response.data.buckets.find(
              (b) => b.bucketName === this.bucketName
            );

            if (!bucket) {
              this.log(
                `⚠ Bucket '${this.bucketName}' not found in your B2 account`,
                "warning"
              );
              this.log(
                "Continuing dry-run without bucket validation...",
                "warning"
              );
            } else {
              this.log(
                "✓ B2 credentials and bucket validated successfully",
                "success"
              );
            }
          }
        } catch (error) {
          this.log(
            `⚠ B2 credential validation failed: ${error.message}`,
            "warning"
          );
          this.log(
            "Continuing dry-run without credential validation...",
            "warning"
          );
        }
      } else {
        // Dry-run mode without credentials - skip B2 validation entirely
        this.log(
          "Skipping B2 credential validation (credentials not configured)",
          "info"
        );
      }

      await this.deployFiles();

      const finalMessage = this.dryRun
        ? "🔍 Dry run completed successfully!"
        : "🎉 Deployment completed successfully!";
      this.log(finalMessage, "success");
      process.exit(0);
    } catch (error) {
      const errorPrefix = this.dryRun ? "Dry run failed" : "Deployment failed";
      this.log(`${errorPrefix}: ${error.message}`, "error");
      process.exit(1);
    }
  }
}

// Run deployment if this script is executed directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isForce = args.includes("--force");

  if (isDryRun) {
    console.log(colors.yellow("🔍 Starting deployment in DRY RUN mode"));
    console.log(colors.yellow("   No files will be uploaded to Backblaze B2"));
    console.log("");
  }

  if (isForce) {
    console.log(colors.red("💪 Starting deployment in FORCE mode"));
    console.log(
      colors.red("   All files will be uploaded regardless of cache")
    );
    console.log("");
  }

  const deployment = new DeploymentManager({
    dryRun: isDryRun,
    force: isForce,
  });
  deployment.deploy();
}

module.exports = DeploymentManager;
