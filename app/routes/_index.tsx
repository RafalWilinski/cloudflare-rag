import React, { useState } from "react";

export default function ChatApp() {
  const [messages, setMessages] = useState<{ text: string; sender: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const handleSendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputMessage.trim()) {
      setMessages([...messages, { text: inputMessage, sender: "user" }]);
      setInputMessage("");
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
        <h2 className="text-xl font-bold mb-4">Uploaded Files</h2>
        <input type="file" onChange={handleFileUpload} className="mb-4" multiple />
        <ul>
          {files.map((file, index) => (
            <li key={index} className="mb-2">
              {file.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 ${message.sender === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block p-2 rounded-lg ${
                  message.sender === "user" ? "bg-blue-500 text-white" : "bg-gray-300"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
        </div>

        {/* Message input */}
        <form onSubmit={handleSendMessage} className="p-4 bg-white">
          <div className="flex">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 border rounded-l-lg p-2"
            />
            <button type="submit" className="bg-blue-500 text-white rounded-r-lg px-4 py-2">
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
