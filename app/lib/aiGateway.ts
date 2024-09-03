const defaultModel = "@cf/meta/llama-3.1-8b-instruct";

// Function to stream LLM responses using the Universal Endpoint
export async function streamLLMResponse({
  accountId,
  messages,
  apiKeys,
  model,
  AI,
  provider,
  isDemo
}: {
  messages: RoleScopedChatInput[];
  accountId: string;
  AI?: Ai;
  model: string;
  provider: string;
  isDemo: boolean;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    groq?: string;
  };
}) {
  const stream = true;
  console.log({
    model,
    provider,
    areApiKeysValid: ensureApiKeys(apiKeys),
    apiKeys,
  });

  if (!ensureApiKeys(apiKeys) && AI) {
    console.log("No API keys provided, using Workers AI");

    return await AI.run(defaultModel, {
      messages,
      stream: true,
    });
  }

  const gatewayId = "cloudflare-rag";
  let providers = [
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
      provider: "openai",
      endpoint: "chat/completions",
      headers: {
        authorization: `Bearer ${apiKeys.openai}`,
        "Content-Type": "application/json",
      },
      query: {
        model: "gpt-4o",
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
    {
      provider: "anthropic",
      endpoint: "v1/messages",
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKeys.anthropic,
        "Content-Type": "application/json",
      },
      query: {
        model: "claude-3-5-sonnet-20240620",
        stream,
        max_tokens: 1024,
        messages,
      },
    },
    {
      provider: "groq",
      endpoint: "chat/completions",
      headers: {
        Authorization: `Bearer ${apiKeys.groq}`,
        "Content-Type": "application/json",
      },
      query: {
        stream,
        model: "llama-3.1-70b-versatile",
        messages,
      },
    },
  ];

  if (isDemo) {
    // Demo account cannot use Claude 3.5 or GPT-4o
    providers = providers.filter(
      (p) => p.query.model !== "gpt-4o" && p.query.model !== "claude-3-5-sonnet-20240620"
    );
  }

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

// New function to return a parsed text response
export async function llmResponse({
  accountId,
  messages,
  apiKeys,
  model,
  AI,
  provider,
}: {
  messages: RoleScopedChatInput[];
  accountId: string;
  AI?: Ai;
  model: string;
  provider: string;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    groq?: string;
  };
}): Promise<string> {
  console.log({
    model,
    provider,
    areApiKeysValid: ensureApiKeys(apiKeys),
    apiKeys,
  });

  if (!ensureApiKeys(apiKeys) && AI) {
    console.log("No API keys provided, using Workers AI");
    const response = await AI.run(defaultModel, {
      messages,
    });
    return (response as { response: string }).response;
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(providers),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: any = await response.json();

  // Handle different response formats based on the provider
  let content = "";
  if (data.content && data.content.text) {
    // Anthropic format
    content = data.content.text;
  } else if (data.choices && data.choices[0] && data.choices[0].message) {
    // OpenAI and Groq format
    content = data.choices[0].message.content;
  } else {
    console.error("Unexpected response format:", data);
    throw new Error("Unexpected response format from AI provider");
  }

  return content;
}
