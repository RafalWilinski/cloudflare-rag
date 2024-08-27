import React, { useState } from "react";
import Markdown from "react-markdown";
import { PlaceholdersAndVanishInput } from "../components/Input";
import { FileUpload } from "../components/fileUpload";

export default function ChatApp() {
  const [messages, setMessages] = useState<{ content: string; role: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    console.log({ event });
    event.preventDefault();

    if (inputMessage.trim()) {
      setMessages([...messages, { content: inputMessage, role: "user" }]);
      setInputMessage("");

      const response = await fetch("/api/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: [...messages, { content: inputMessage, role: "user" }] }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      console.log("reader defined?", !!reader);
      const decoder = new TextDecoder();

      if (reader) {
        let currentAssistantMessage = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          console.log("Received chunk:", chunk);

          try {
            const parsedChunk = JSON.parse(chunk.trim().replace(/^data:\s*/, ""));
            if (parsedChunk.response) {
              currentAssistantMessage += parsedChunk.response;
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
            }
          } catch (error) {
            console.log("Non-JSON chunk received:", chunk);
          }
        }
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    setFiles([...files, ...newFiles]);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left sidebar */}
      <div className="w-1/4 bg-white p-4 overflow-y-auto">
        {/* <input type="file" onChange={handleFileUpload} className="mb-4" multiple /> */}
        <FileUpload onChange={() => {}} />
        {files.length > 0 && <h2 className="text-xl font-bold mb-4">Uploaded Files</h2>}
        <ul>
          {files.map((file, index) => (
            <li key={index} className="mb-2">
              {file.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 ${message.role === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block p-2 rounded-full px-4 py-2 ${
                  message.role === "user" ? "bg-gray-300" : ""
                }`}
              >
                <Markdown>{message.content}</Markdown>
              </div>
            </div>
          ))}
        </div>

        <div className="flex my-4">
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
