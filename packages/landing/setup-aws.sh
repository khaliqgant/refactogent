#!/bin/bash

# Refactogent Landing Page - AWS Infrastructure Setup
# This script creates S3 bucket and CloudFront distribution for static site hosting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SITE_NAME="refactogent"
AWS_REGION="${AWS_REGION:-us-east-1}"
BUCKET_NAME="${BUCKET_NAME:-${SITE_NAME}-landing}"

echo -e "${GREEN}=== Refactogent AWS Infrastructure Setup ===${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  Site Name: ${SITE_NAME}"
echo "  S3 Bucket: ${BUCKET_NAME}"
echo "  AWS Region: ${AWS_REGION}"
echo ""

# Create S3 bucket
echo -e "${YELLOW}Creating S3 bucket...${NC}"
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
    if [ "$AWS_REGION" == "us-east-1" ]; then
        aws s3 mb "s3://${BUCKET_NAME}"
    else
        aws s3 mb "s3://${BUCKET_NAME}" --region "${AWS_REGION}"
    fi
    echo -e "${GREEN}✓ S3 bucket created: ${BUCKET_NAME}${NC}"
else
    echo -e "${YELLOW}⚠ S3 bucket already exists: ${BUCKET_NAME}${NC}"
fi

# Block public access (CloudFront will access via OAI)
echo -e "${YELLOW}Configuring S3 bucket public access block...${NC}"
aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo -e "${GREEN}✓ Public access blocked${NC}"

# Enable versioning
echo -e "${YELLOW}Enabling S3 versioning...${NC}"
aws s3api put-bucket-versioning \
    --bucket "${BUCKET_NAME}" \
    --versioning-configuration Status=Enabled
echo -e "${GREEN}✓ Versioning enabled${NC}"

# Create CloudFront Origin Access Identity (OAI)
echo -e "${YELLOW}Creating CloudFront Origin Access Identity...${NC}"
OAI_ID=$(aws cloudfront create-cloud-front-origin-access-identity \
    --cloud-front-origin-access-identity-config \
        CallerReference="${SITE_NAME}-$(date +%s)",Comment="${SITE_NAME} OAI" \
    --query 'CloudFrontOriginAccessIdentity.Id' \
    --output text 2>/dev/null || echo "")

if [ -z "$OAI_ID" ]; then
    # OAI might already exist, try to find it
    OAI_ID=$(aws cloudfront list-cloud-front-origin-access-identities \
        --query "CloudFrontOriginAccessIdentityList.Items[?Comment=='${SITE_NAME} OAI'].Id | [0]" \
        --output text)

    if [ "$OAI_ID" == "None" ] || [ -z "$OAI_ID" ]; then
        echo -e "${RED}Error: Failed to create or find OAI${NC}"
        exit 1
    fi
    echo -e "${YELLOW}⚠ Using existing OAI: ${OAI_ID}${NC}"
else
    echo -e "${GREEN}✓ OAI created: ${OAI_ID}${NC}"
fi

# Get OAI canonical user ID
OAI_USER=$(aws cloudfront get-cloud-front-origin-access-identity \
    --id "${OAI_ID}" \
    --query 'CloudFrontOriginAccessIdentity.S3CanonicalUserId' \
    --output text)

# Create bucket policy to allow CloudFront access
echo -e "${YELLOW}Creating S3 bucket policy for CloudFront access...${NC}"
BUCKET_POLICY=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCloudFrontOAI",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${OAI_ID}"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
        }
    ]
}
EOF
)

echo "$BUCKET_POLICY" | aws s3api put-bucket-policy \
    --bucket "${BUCKET_NAME}" \
    --policy file:///dev/stdin
echo -e "${GREEN}✓ Bucket policy created${NC}"

# Create CloudFront distribution
echo -e "${YELLOW}Creating CloudFront distribution...${NC}"

DISTRIBUTION_CONFIG=$(cat <<EOF
{
    "CallerReference": "${SITE_NAME}-$(date +%s)",
    "Comment": "${SITE_NAME} landing page",
    "Enabled": true,
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "S3-${BUCKET_NAME}",
                "DomainName": "${BUCKET_NAME}.s3.amazonaws.com",
                "S3OriginConfig": {
                    "OriginAccessIdentity": "origin-access-identity/cloudfront/${OAI_ID}"
                }
            }
        ]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-${BUCKET_NAME}",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"]
            }
        },
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {
                "Forward": "none"
            }
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000,
        "Compress": true
    },
    "CustomErrorResponses": {
        "Quantity": 2,
        "Items": [
            {
                "ErrorCode": 403,
                "ResponsePagePath": "/index.html",
                "ResponseCode": "200",
                "ErrorCachingMinTTL": 300
            },
            {
                "ErrorCode": 404,
                "ResponsePagePath": "/index.html",
                "ResponseCode": "200",
                "ErrorCachingMinTTL": 300
            }
        ]
    },
    "PriceClass": "PriceClass_100",
    "ViewerCertificate": {
        "CloudFrontDefaultCertificate": true
    }
}
EOF
)

DISTRIBUTION_ARN=$(echo "$DISTRIBUTION_CONFIG" | aws cloudfront create-distribution \
    --distribution-config file:///dev/stdin \
    --query 'Distribution.ARN' \
    --output text 2>/dev/null || echo "")

if [ -z "$DISTRIBUTION_ARN" ]; then
    echo -e "${YELLOW}⚠ Distribution might already exist or creation failed${NC}"
    echo -e "${YELLOW}Fetching existing distributions...${NC}"

    DISTRIBUTION_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?Comment=='${SITE_NAME} landing page'].Id | [0]" \
        --output text)

    if [ "$DISTRIBUTION_ID" != "None" ] && [ -n "$DISTRIBUTION_ID" ]; then
        DISTRIBUTION_DOMAIN=$(aws cloudfront get-distribution \
            --id "${DISTRIBUTION_ID}" \
            --query 'Distribution.DomainName' \
            --output text)
        echo -e "${GREEN}✓ Using existing distribution${NC}"
    else
        echo -e "${RED}Error: Failed to create or find distribution${NC}"
        exit 1
    fi
else
    DISTRIBUTION_ID=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?ARN=='${DISTRIBUTION_ARN}'].Id | [0]" \
        --output text)

    DISTRIBUTION_DOMAIN=$(aws cloudfront get-distribution \
        --id "${DISTRIBUTION_ID}" \
        --query 'Distribution.DomainName' \
        --output text)

    echo -e "${GREEN}✓ CloudFront distribution created: ${DISTRIBUTION_ID}${NC}"
fi

# Save configuration to file
echo -e "${YELLOW}Saving configuration...${NC}"
cat > .aws-config.json <<EOF
{
    "bucketName": "${BUCKET_NAME}",
    "region": "${AWS_REGION}",
    "distributionId": "${DISTRIBUTION_ID}",
    "distributionDomain": "${DISTRIBUTION_DOMAIN}",
    "oaiId": "${OAI_ID}"
}
EOF
echo -e "${GREEN}✓ Configuration saved to .aws-config.json${NC}"

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "S3 Bucket: ${BUCKET_NAME}"
echo "CloudFront Distribution ID: ${DISTRIBUTION_ID}"
echo "CloudFront Domain: ${DISTRIBUTION_DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Deploy your site: npm run deploy"
echo "  2. Access at: https://${DISTRIBUTION_DOMAIN}"
echo ""
echo -e "${YELLOW}Note: CloudFront distribution may take 15-20 minutes to fully deploy${NC}"
