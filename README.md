# Fullstack Cloudflare RAG

> This is a fullstack example of how to build a RAG (Retrieval Augmented Generation) app with Cloudflare. It uses Cloudflare Workers, Pages, D1, R2, and AI SDK.

https://github.com/user-attachments/assets/cbaa0380-7ad6-448d-ad44-e83772a9cf3f

## Development

Install dependencies:

```sh
pnpm install # or npm install
```

Deploy necessary primitives:

```sh
./setup.sh
```

Then, create a `.dev.vars` file with your API keys:

```sh
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id # Required
GROQ_API_KEY=your-groq-api-key # Optional
OPENAI_API_KEY=your-openai-api-key # Optional
ANTHROPIC_API_KEY=your-anthropic-api-key # Optional
```

If you don't have these keys, `/api/stream` will fallback to [Workers AI](https://developers.cloudflare.com/workers-ai/).

Run the dev server:

```sh
npm run dev
```

And access the app at `http://localhost:5173/`.

## Deployment

Having the necessary primitives setup, first setup secrets:

```sh
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

Then, deploy your app to Cloudflare Pages:

```sh
npm run deploy
```

## Hybrid Search RAG

![Hybrid Search RAG](./hybrid-rag.png)

This project uses a combination of classical Full Text Search (sparse) against Cloudflare D1 and Hybrid Search with embeddings against Vectorize (dense) to provide the best of both worlds providing the most applicable context to the LLM.
