#! /bin/bash
set -e

npx wrangler vectorize create cloudflare-rag-index --dimensions=1024 --metric=euclidean

npx wrangler r2 bucket create cloudflare-rag-bucket 