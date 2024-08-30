#! /bin/bash
set -e

cp .env.template .dev.vars

# Must be on wrangler 3.72.3 or later, otherwise the create command will create V1 indexes, not V2
npx wrangler vectorize create cloudflare-rag-index --dimensions=1024 --metric=euclidean
# Must be on wrangler 3.72.3 or later
npx wrangler vectorize create-metadata-index cloudflare-rag-index --property-name=session_id --type=string

npx wrangler r2 bucket create cloudflare-rag-bucket

# After running this, you'll need to replace the database_id in wrangler.toml
npx wrangler d1 create cloudflare-rag

# After running this, you'll need to replace the id in wrangler.toml
npx wrangler kv namespace create rate-limiter