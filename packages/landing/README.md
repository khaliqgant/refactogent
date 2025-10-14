# Refactogent Landing Page

Marketing landing page for Refactogent - built with plain HTML and Tailwind CSS.

## Features

- **Pure HTML + Tailwind CSS** - No build step required
- **SEO Optimized** - Meta tags, Open Graph, Twitter Cards, JSON-LD schema
- **Responsive Design** - Mobile-first design with Tailwind
- **AWS Deployment** - Automated S3 + CloudFront setup
- **CI/CD Ready** - GitHub Actions workflow included

## Quick Start

### Local Development

```bash
# Start local server
npm run dev

# Open http://localhost:8080
```

### AWS Deployment

#### 1. Setup AWS Infrastructure

First time setup - creates S3 bucket and CloudFront distribution:

```bash
npm run setup
```

This will:
- Create an S3 bucket for hosting
- Configure bucket policies
- Create CloudFront distribution with HTTPS
- Set up Origin Access Identity (OAI)
- Save configuration to `.aws-config.json`

**Requirements:**
- AWS CLI installed and configured
- Appropriate AWS permissions (S3, CloudFront)

#### 2. Deploy

```bash
npm run deploy
```

This will:
- Sync files to S3
- Set appropriate cache headers
- Invalidate CloudFront cache
- Display your site URL

### GitHub Actions Deployment

The repository includes a GitHub Actions workflow for automatic deployment on push to main.

#### Setup GitHub Secrets

Configure these secrets in your GitHub repository (Settings > Secrets and variables > Actions):

1. **AWS_ROLE_ARN** - ARN of IAM role with S3 and CloudFront permissions
2. **AWS_REGION** - AWS region (e.g., `us-east-1`)
3. **S3_BUCKET_NAME** - Name of your S3 bucket
4. **CLOUDFRONT_DISTRIBUTION_ID** - CloudFront distribution ID
5. **CLOUDFRONT_DOMAIN** - CloudFront domain name (e.g., `d1234567890.cloudfront.net`)

#### IAM Role Setup

Create an IAM role with GitHub OIDC provider and this policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR_BUCKET_NAME",
                "arn:aws:s3:::YOUR_BUCKET_NAME/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudfront:CreateInvalidation",
                "cloudfront:GetInvalidation"
            ],
            "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
    ]
}
```

Trust relationship:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:*"
                }
            }
        }
    ]
}
```

#### Trigger Deployment

The workflow triggers automatically when:
- Changes are pushed to `main` branch in `packages/landing/`
- Changes are made to `.github/workflows/deploy-landing.yml`
- Manually triggered via GitHub Actions UI

## Project Structure

```
packages/landing/
├── index.html              # Landing page
├── package.json            # Package configuration
├── setup-aws.sh           # AWS infrastructure setup script
├── README.md              # This file
└── .aws-config.json       # Generated AWS config (gitignored)
```

## SEO Features

- **Meta Tags**: Title, description, keywords
- **Open Graph**: Facebook sharing optimization
- **Twitter Cards**: Twitter sharing optimization
- **JSON-LD Schema**: Structured data for search engines
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Mobile Optimization**: Responsive viewport configuration

## Cache Strategy

- **Static Assets**: 1 year cache (`max-age=31536000`)
- **HTML**: 1 hour cache with revalidation (`max-age=3600, must-revalidate`)
- **CloudFront**: Compressed delivery with HTTPS redirect

## Customization

### Update Content

Edit `index.html` to update:
- Hero section text
- Features and use cases
- Call-to-action buttons
- Footer links

### Update Styles

The page uses Tailwind CSS via CDN. Customize by:
- Modifying Tailwind config in `<script>` tag
- Changing color scheme in `theme.extend.colors`
- Updating custom CSS in `<style>` tag

### Update Domain

To use a custom domain:

1. Add domain to CloudFront distribution
2. Create SSL certificate in ACM (us-east-1)
3. Update Route53 DNS records
4. Update meta tags in HTML

## Development

### Prerequisites

- Node.js 18+
- AWS CLI
- Python 3 (for local dev server)

### Scripts

- `npm run dev` - Start local development server
- `npm run setup` - Setup AWS infrastructure (one-time)
- `npm run deploy` - Deploy to AWS
- `npm run clean` - Remove AWS config file

## Maintenance

### Update CloudFront

If you need to update CloudFront settings:

```bash
aws cloudfront get-distribution-config \
    --id YOUR_DISTRIBUTION_ID \
    > distribution-config.json

# Edit distribution-config.json

aws cloudfront update-distribution \
    --id YOUR_DISTRIBUTION_ID \
    --distribution-config file://distribution-config.json
```

### Monitoring

Check deployment status:

```bash
# S3 sync status
aws s3 ls s3://YOUR_BUCKET_NAME/

# CloudFront invalidation status
aws cloudfront get-invalidation \
    --distribution-id YOUR_DISTRIBUTION_ID \
    --id INVALIDATION_ID
```

## Troubleshooting

**Issue**: `403 Forbidden` when accessing CloudFront URL

**Solution**: Check bucket policy allows CloudFront OAI access

**Issue**: Changes not visible after deployment

**Solution**: Wait 5-10 minutes for CloudFront cache invalidation

**Issue**: AWS CLI commands fail

**Solution**: Check AWS credentials with `aws sts get-caller-identity`

## Cost Estimate

AWS costs for this landing page:

- **S3**: ~$0.023/GB/month for storage
- **CloudFront**: ~$0.085/GB for data transfer (first 10TB)
- **Requests**: Minimal (< $1/month for typical traffic)

**Estimated total**: $1-5/month depending on traffic

## License

MIT - see [LICENSE](../../LICENSE) for details
