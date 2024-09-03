/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { toast, Toaster } from "sonner";
import { stream } from "fetch-event-stream";
import { PlaceholdersAndVanishInput } from "../components/Input";
import { FileUpload } from "../components/fileUpload";
import AnimatedShinyText from "~/components/magicui/animated-shiny-text";
import { IconBrandGithub } from "@tabler/icons-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "../components/button";
import { exampleFiles } from "../lib/exampleFiles";

export const meta = () => {
  return [{ title: `Fullstack Cloudflare RAG` }];
};

export default function ChatApp() {
  const [messages, setMessages] = useState<{ content: string; role: string; isHidden?: boolean }[]>(
    []
  );
  const [inputMessage, setInputMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [informativeMessage, setInformativeMessage] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [provider, setProvider] = useState("groq");
  const [waitingTime, setWaitingTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [relevantContext, setRelevantContext] = useState<{ text: string }[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [selectedExample, setSelectedExample] = useState<(typeof exampleFiles)[0] | null>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement> | string) => {
    if (typeof event !== "string") {
      event.preventDefault();
    }
    console.log("event", event, typeof event);

    if (typeof event === "string" || inputMessage.trim()) {
      const newMsg = { content: typeof event === "string" ? event : inputMessage, role: "user" };
      setMessages([...messages, newMsg]);
      setInputMessage("");
      setRelevantContext([]); // Reset relevant context for new message

      const response = await stream("/api/stream", {
        method: "POST",
        headers: {
          "Content-Type": "text/event-stream",
        },
        body: JSON.stringify({
          messages: [...messages, newMsg].map((m) => ({ role: m.role, content: m.content })),
          sessionId,
          model,
          provider,
        }),
      });

      for await (const event of response) {
        try {
          const parsedChunk = JSON.parse(event?.data?.trim().replace(/^data:\s*/, "") || "");

          const newContent =
            parsedChunk.response ||
            parsedChunk.choices?.[0]?.delta?.content ||
            parsedChunk.delta?.text ||
            "";

          if (newContent) {
            setInformativeMessage("");

            // This works incorrectly being invoked sometimes twice adding the same content!
            setMessages((prevMessages) => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage?.role === "assistant" && !lastMessage.isHidden) {
                // Check if the new content is already at the end of the last message
                if (!lastMessage.content.endsWith(newContent)) {
                  return [
                    ...prevMessages.slice(0, -1),
                    {
                      ...lastMessage,
                      isHidden: false,
                      content: lastMessage.content + newContent,
                    },
                  ];
                }
              } else {
                return [
                  ...prevMessages,
                  { content: newContent, role: "assistant", isHidden: false },
                ];
              }
              return prevMessages; // Return unchanged if content was already added
            });
          } else if (parsedChunk.message) {
            console.log("Informative message:", parsedChunk.message);
            setInformativeMessage(parsedChunk.message);
          } else if (parsedChunk.error) {
            console.error("Error:", parsedChunk.error);
            setInformativeMessage("");
            toast.error(parsedChunk.error);
          }

          if (parsedChunk.relevantContext) {
            setRelevantContext(parsedChunk.relevantContext);
            // Add relevant context to messages array
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                content:
                  "Relevant context:\n" +
                  parsedChunk.relevantContext.map((ctx: { text: string }) => ctx.text).join("\n"),
                role: "assistant",
                isHidden: true,
              },
            ]);
          }
          if (parsedChunk.queries) {
            setQueries(parsedChunk.queries);
          }
        } catch (error) {
          console.log("Non-JSON chunk received:", event?.data);
        }
      }
    }
  };

  useEffect(() => {
    if (informativeMessage) {
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setWaitingTime((Date.now() - startTime) / 1000);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setWaitingTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [informativeMessage]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current && shouldAutoScroll) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current;
      messagesContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  };

  useEffect(() => {
    if (isNearBottom()) {
      const timer = setTimeout(scrollToBottom, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleScroll = () => {
    setShouldAutoScroll(isNearBottom());
  };

  const isNearBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      return scrollHeight - scrollTop - clientHeight < 250;
    }
    return false;
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster />
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-gray-200"
        style={{ zIndex: 1000 }} // Ensure the button is on top
      >
        ☰
      </button>

      <a
        href="https://github.com/RafalWilinski/cloudflare-rag"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-0 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white p-2 rounded-full border border-gray-200 px-4 cursor-pointer mt-1 opacity-100 z-50"
        style={{ zIndex: 1000 }} // Ensure the link is on top
      >
        <IconBrandGithub className="w-4 h-4" />
        <AnimatedShinyText>Fork or star on Github</AnimatedShinyText>
      </a>

      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 transform transition-transform duration-300 ease-in-out fixed lg:static top-0 left-0 h-full w-64 bg-white p-4 overflow-y-auto z-40 flex flex-col`}
      >
        <div className="flex-grow">
          <FileUpload
            onChange={() => { }}
            sessionId={sessionId}
            setSessionId={setSessionId}
            setSelectedExample={setSelectedExample}
          />
        </div>
        {sessionId && (
          <div className="mt-auto pt-4 text-xs text-gray-500 break-all">
            Session ID: {sessionId}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full lg:w-[calc(100%-16rem)]">
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4"
          onScroll={handleScroll}
          style={{ maxHeight: "calc(100vh - 64px)" }} // Ensure main content is scrollable
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="text-sm text-gray-500 mb-0">Pick model:</div>
              <Select
                onValueChange={(value: string) => {
                  setModel(value.split("_")[1]);
                  setProvider(value.split("_")[0]);
                }}
                defaultValue="groq_llama-3.1-8b-instant"
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900">
                  <SelectGroup>
                    <SelectLabel
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <img
                        style={{
                          width: "16px",
                          height: "16px",
                        }}
                        alt="Groq logo"
                        src="https://media.licdn.com/dms/image/v2/C560BAQH-yCK5i0E6jA/company-logo_200_200/company-logo_200_200/0/1654720696784/groq_logo?e=2147483647&v=beta&t=pp0y5xYtKp1Msznqp_Xu562bpUUpr1puC6GcHue56Zk"
                      ></img>
                      Groq
                    </SelectLabel>
                    <SelectItem value="groq_llama-3.1-8b-instant" className="cursor-pointer">
                      Llama 3.1 8B (Preview)
                    </SelectItem>
                    <SelectItem value="groq_llama-3.1-70b-versatile" className="cursor-pointer">
                      Llama 3.1 70B (Preview)
                    </SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <img
                        style={{
                          width: "16px",
                          height: "16px",
                        }}
                        src="https://logosandtypes.com/wp-content/uploads/2022/07/OpenAI.png"
                        alt="OpenAI logo"
                      ></img>
                      OpenAI
                    </SelectLabel>
                    <SelectItem value="openai_gpt-4o-mini" className="cursor-pointer">
                      GPT-4o Mini
                    </SelectItem>
                    <SelectItem value="openai_gpt-4o" className="cursor-pointer">
                      GPT-4o
                    </SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <img
                        style={{
                          width: "16px",
                          height: "16px",
                        }}
                        src="https://www.finsmes.com/wp-content/uploads/2021/05/anthropic.jpg"
                        alt="Anthropic logo"
                      ></img>
                      Anthropic
                    </SelectLabel>
                    <SelectItem
                      value="anthropic_claude-3-5-sonnet-20240620"
                      className="cursor-pointer"
                    >
                      Claude 3.5 Sonnet
                    </SelectItem>
                    <SelectItem
                      value="anthropic_claude-3-haiku-20240307"
                      className="cursor-pointer"
                    >
                      Claude 3 Haiku
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {selectedExample && (
                <div className="mt-8 text-left w-full max-w-md">
                  <h3 className="font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                    Example questions for {selectedExample.name}:
                  </h3>
                  <ul className="list-disc list-inside space-y-2">
                    {selectedExample.questions.map((question, index) => (
                      <li
                        key={index}
                        className="text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer hover:text-blue-500"
                        onClick={() => handleSendMessage(question)}
                      >
                        {question}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {messages
                .filter((message) => !message.isHidden)
                .map((message, index) => (
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
              <div ref={messagesEndRef} />
            </>
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
                <span className="text-sm text-gray-500">{informativeMessage}</span>
                <span className="text-sm text-gray-400 ml-2">({waitingTime.toFixed(1)}s)</span>
              </div>
            </div>
          )}

          {relevantContext.length > 0 && (
            <Drawer>
              <DrawerTrigger>
                <Button variant="outline" className="border-gray-300 dark:border-zinc-600">
                  See relevant context
                </Button>
              </DrawerTrigger>
              <DrawerContent className="bg-white dark:bg-zinc-900">
                <DrawerHeader>
                  <DrawerTitle>Queries used against vector database</DrawerTitle>
                  <DrawerDescription>
                    <ol className="list-disc list-inside text-sm text-gray-500">
                      {queries.map((query, index) => (
                        <li key={index}>{query}</li>
                      ))}
                    </ol>
                  </DrawerDescription>

                  <DrawerTitle>Relevant context fetched from documents</DrawerTitle>
                  <DrawerDescription>
                    <ol className="list-disc list-inside text-sm text-gray-500">
                      {relevantContext.map((context, index) => (
                        <li key={index}>{context.text}</li>
                      ))}
                    </ol>
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                  {/* <DrawerClose>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose> */}
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
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
