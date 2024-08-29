import React, { useState, useEffect } from "react";
import Markdown from "react-markdown";
import { Toaster } from "sonner";
import { stream } from "fetch-event-stream";
import { PlaceholdersAndVanishInput } from "../components/Input";
import { FileUpload } from "../components/fileUpload";
import AnimatedShinyText from "~/components/magicui/animated-shiny-text";
import { IconBrandGithub } from "@tabler/icons-react";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export const meta = () => {
  return [{ title: `Fullstack Cloudflare RAG` }];
};

export default function ChatApp() {
  const [verboseMode, setVerboseMode] = useState(false);
  const [messages, setMessages] = useState<{ content: string; role: string }[]>(
    []
  );
  const [inputMessage, setInputMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [informativeMessage, setInformativeMessage] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [model, setModel] = useState("llama");
  const [provider, setProvider] = useState("groq");

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputMessage.trim()) {
      setMessages([...messages, { content: inputMessage, role: "user" }]);
      setInputMessage("");

      const response = await stream("/api/stream", {
        method: "POST",
        headers: {
          "Content-Type": "text/event-stream",
        },
        body: JSON.stringify({
          messages: [...messages, { content: inputMessage, role: "user" }],
          sessionId,
          model,
          provider,
        }),
      });

      for await (let event of response) {
        console.log("event", event);
        try {
          const parsedChunk = JSON.parse(
            event?.data?.trim().replace(/^data:\s*/, "") || ""
          );

          const newContent =
            parsedChunk.response ||
            parsedChunk.choices?.[0]?.delta?.content ||
            parsedChunk.delta?.text ||
            "";

          if (newContent) {
            setInformativeMessage(""); // Clear informative message when response starts

            setMessages((prevMessages) => {
              const newMessages = [...prevMessages];
              if (newMessages[newMessages.length - 1]?.role === "assistant") {
                newMessages[newMessages.length - 1].content += newContent;
              } else {
                newMessages.push({
                  content: newContent,
                  role: "assistant",
                });
              }
              return newMessages;
            });
          } else if (parsedChunk.message) {
            console.log("Informative message:", parsedChunk.message);
            setInformativeMessage(parsedChunk.message);
          }
        } catch (error) {
          console.log("Non-JSON chunk received:", event?.data);
        }
      }
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster />
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-20 p-2 rounded-md bg-gray-200"
      >
        ☰
      </button>

      <a
        href="https://github.com/RafalWilinski/cloudflare-rag"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-full border border-gray-200 px-4 cursor-pointer mt-1"
      >
        <IconBrandGithub className="w-4 h-4" />
        <AnimatedShinyText>Fork or star on Github</AnimatedShinyText>
      </a>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 transform transition-transform duration-300 ease-in-out fixed lg:static top-0 left-0 h-full w-64 bg-white p-4 overflow-y-auto z-10 flex flex-col`}
      >
        <div className="flex-grow">
          <FileUpload onChange={() => {}} sessionId={sessionId} />
        </div>
        {sessionId && (
          <div className="mt-auto pt-4 text-xs text-gray-500 break-all">
            <div className="items-top flex space-x-2 mb-2">
              <Checkbox
                id="terms1"
                onClick={() => setVerboseMode(!verboseMode)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="terms1"
                  className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Verbose Mode
                </label>
                <p className="text-x text-muted-foreground">
                  Show me debugging data
                </p>
              </div>
            </div>
            {/* Session ID: {sessionId} */}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full lg:w-[calc(100%-16rem)]">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <Select
                onValueChange={(value) => {
                  setModel(value.split("_")[1]);
                  setProvider(value.split("_")[0]);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Groq</SelectLabel>
                    <SelectItem value="groq_llama-3.1-8b-instant">
                      Llama 3.1 8B (Preview)
                    </SelectItem>
                    <SelectItem value="groq_llama-3.1-70b-versatile">
                      Llama 3.1 70B (Preview)
                    </SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>OpenAI</SelectLabel>
                    <SelectItem value="openai_gpt-4o-mini">
                      GPT-4o Mini
                    </SelectItem>
                    <SelectItem value="openai_gpt-4o">GPT-4o</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Anthropic</SelectLabel>
                    <SelectItem value="anthropic_claude-3-5-sonnet-20240620">
                      Claude 3.5 Sonnet
                    </SelectItem>
                    <SelectItem value="anthropic_claude-3-haiku-20240307">
                      Claude 3 Haiku
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`mb-4 ${
                  message.role === "user" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block p-2 rounded-full px-4 py-2 ${
                    message.role === "user" ? "bg-gray-300" : ""
                  } opacity-0 animate-fadeIn`}
                >
                  <Markdown className="prose">{message.content}</Markdown>
                </div>
              </div>
            ))
          )}

          {/* Informative message */}
          {informativeMessage && (
            <div className="mb-4 text-left">
              <div className="inline-flex items-center p-2 rounded-full px-4 py-2 bg-gray-100">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-sm text-gray-500">
                  {informativeMessage}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex my-4 px-4">
          <PlaceholdersAndVanishInput
            onChange={(e) => setInputMessage(e.target.value)}
            placeholders={[
              "Give me a summary of the documents provided",
              "Random fact about...",
              "Type a message...",
            ]}
            onSubmit={handleSendMessage}
          />
        </div>
      </div>
    </div>
  );
}
