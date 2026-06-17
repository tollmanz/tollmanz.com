# www.tollmanz.com

Personal website built with [Eleventy (11ty)](https://www.11ty.dev/) with automated deployment to Backblaze B2.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Deploy Site
npm run deploy

# Test deployment without uploading (dry-run mode)
npm run deploy:dry-run

# Force redeploy all files (bypass cache)
npm run deploy:force
```

## Deployment Setup

### GitHub Pages (under evaluation, parallel deploy)

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to
`main`, in parallel with the Backblaze deploy below. Production traffic still
flows through Fastly to Backblaze; this is a staging step to validate GitHub
Pages before any Fastly cutover, so the two run side by side for now.

One-time repo setup required to serve the custom domain from Pages:

1. Settings -> Pages -> Source: "GitHub Actions"
2. Settings -> Pages -> Custom domain: `www.tollmanz.com`

Verify the Pages origin without affecting production (Fastly still serves
Backblaze), using the Host header Fastly will eventually send:

```bash
# homepage and a pretty-URL post should both return 200
curl -sSI -H 'Host: www.tollmanz.com' https://tollmanz.github.io/
curl -sSI -H 'Host: www.tollmanz.com' https://tollmanz.github.io/wp-kses-performance/
# without the override, GitHub should 301 github.io -> the custom domain
curl -sSI https://tollmanz.github.io/
```

### GitHub Actions CI/CD Setup

For automated deployment on commits to the `main` branch:

1. Go to the GitHub repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add the following repository secrets:
   - `B2_APPLICATION_KEY_ID`: Backblaze B2 Application Key ID
   - `B2_APPLICATION_KEY`: Backblaze B2 Application Key
   - `B2_BUCKET_NAME`: Backblaze B2 bucket name

4. The workflow will automatically trigger on pushes to the `main` branch

### Manual Deployment

1. Go to the "Actions" tab
2. Select the "Deploy Site" workflow
3. Click "Run workflow" and select the branch
4. Optional: Check "Force redeploy all files (bypass cache)" to force upload all files
5. Click "Run workflow"

### Local Deployment

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Configure Backblaze B2 credentials in the `.env` file:

   ```bash
   # Backblaze B2 Configuration
   B2_APPLICATION_KEY_ID=your_application_key_id_here
   B2_APPLICATION_KEY=your_application_key_here
   B2_BUCKET_NAME=your_bucket_name_here
   ```

3. Run the deployment script:

   ```bash
   # Test first (recommended)
   npm run deploy:dry-run

   # Actual deployment
   npm run deploy
   ```
