const defaultModel = "@cf/meta/llama-3.1-8b-instruct";

// Function to stream LLM responses using the Universal Endpoint
export async function streamLLMResponse({
  accountId,
  messages,
  apiKeys,
  model,
  AI,
  provider,
  stream = true,
}: {
  messages: RoleScopedChatInput[];
  accountId: string;
  AI?: Ai;
  model: string;
  provider: string;
  stream?: boolean;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    groq?: string;
  };
}) {
  console.log({
    model,
    provider,
    areApiKeysValid: ensureApiKeys(apiKeys),
    apiKeys,
  });

  if (!ensureApiKeys(apiKeys) && AI) {
    return await AI.run(defaultModel, {
      messages,
      stream: true,
    });
  }

  const gatewayId = "cloudflare-rag";
  const providers = [
    {
      provider: "groq",
      endpoint: "chat/completions",
      headers: {
        Authorization: `Bearer ${apiKeys.groq}`,
        "Content-Type": "application/json",
      },
      query: {
        stream,
        model: "llama-3.1-8b-instant",
        messages,
      },
    },
    {
      provider: "openai",
      endpoint: "chat/completions",
      headers: {
        authorization: `Bearer ${apiKeys.openai}`,
        "Content-Type": "application/json",
      },
      query: {
        model: "gpt-4o-mini",
        stream,
        messages,
      },
    },
    {
      provider: "anthropic",
      endpoint: "v1/messages",
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKeys.anthropic,
        "Content-Type": "application/json",
      },
      query: {
        model: "claude-3-haiku-20240307",
        stream,
        max_tokens: 1024,
        messages,
      },
    },
  ];

  if (provider && model) {
    const selectedProvider = providers.find((p) => p.provider === provider);
    if (selectedProvider) {
      selectedProvider.query.model = model;
      providers.splice(providers.indexOf(selectedProvider), 1);
      providers.unshift(selectedProvider);
    }
  }

  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(providers),
  });
}

function ensureApiKeys(apiKeys: Record<string, string | undefined>): boolean {
  return Object.values(apiKeys).some((key) => key !== undefined);
}
