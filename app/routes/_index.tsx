import React, { useState, useEffect } from "react";
import Markdown from "react-markdown";
import { Toaster } from 'sonner'
import { PlaceholdersAndVanishInput } from "../components/Input";
import { FileUpload } from "../components/fileUpload";
import AnimatedShinyText from "~/components/magicui/animated-shiny-text";
import { IconBrandGithub } from "@tabler/icons-react";

export const meta = () => {
  return [
    { title: `Fullstack Cloudflare RAG` }
  ];
};

export default function ChatApp() {
  const [messages, setMessages] = useState<{ content: string; role: string }[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [informativeMessage, setInformativeMessage] = useState("");
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputMessage.trim()) {
      setMessages([...messages, { content: inputMessage, role: "user" }]);
      setInputMessage("");

      const response = await fetch("/api/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, { content: inputMessage, role: "user" }],
          sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let currentAssistantMessage = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          try {
            const parsedChunk = JSON.parse(chunk.trim().replace(/^data:\s*/, ""));
            if (parsedChunk.response) {
              currentAssistantMessage += parsedChunk.response;
              setInformativeMessage(""); // Clear informative message when response starts
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages];
                if (newMessages[newMessages.length - 1]?.role === "assistant") {
                  newMessages[newMessages.length - 1].content = currentAssistantMessage;
                } else {
                  newMessages.push({ content: currentAssistantMessage, role: "assistant" });
                }
                return newMessages;
              });
            } else if (parsedChunk.message) {
              console.log("Informative message:", parsedChunk.message);
              setInformativeMessage(parsedChunk.message);
            }
          } catch (error) {
            console.log("Non-JSON chunk received:", chunk);
          }
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

      <a href="https://github.com/RafalWilinski/cloudflare-rag" target="_blank" rel="noopener noreferrer" className="absolute top-0 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-full border border-gray-200 px-4 cursor-pointer mt-1">
        <IconBrandGithub className="w-4 h-4" />
        <AnimatedShinyText>Fork or star on Github</AnimatedShinyText>
      </a>

      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 transform transition-transform duration-300 ease-in-out fixed lg:static top-0 left-0 h-full w-64 bg-white p-4 overflow-y-auto z-10 flex flex-col`}
      >
        <div className="flex-grow">
          <FileUpload onChange={() => { }} sessionId={sessionId} />
        </div>
        {sessionId && (
          <div className="mt-auto pt-4 text-xs text-gray-500 break-all">
            Session ID: {sessionId}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full lg:w-[calc(100%-16rem)]">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 ${message.role === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block p-2 rounded-full px-4 py-2 ${message.role === "user" ? "bg-gray-300" : ""
                  } opacity-0 animate-fadeIn`}
              >
                <Markdown className="prose">{message.content}</Markdown>
              </div>
            </div>
          ))}

          {/* Informative message */}
          {informativeMessage && (
            <div className="mb-4 text-left">
              <div className="inline-flex items-center p-2 rounded-full px-4 py-2 bg-gray-100">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-gray-500">{informativeMessage}</span>
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
