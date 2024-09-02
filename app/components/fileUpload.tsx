/* eslint-disable jsx-a11y/anchor-is-valid */
import { cn } from "../lib/utils";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { IconUpload, IconLoader2 } from "@tabler/icons-react";
import { useDropzone } from "react-dropzone-esm";
import { exampleFiles } from "../lib/exampleFiles";
import { stream } from "fetch-event-stream";

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 20,
    y: -20,
    opacity: 0.9,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const FileUpload = ({
  onChange,
  sessionId,
  setSessionId,
  setSelectedExample,
}: {
  onChange?: (files: File[]) => void;
  sessionId: string;
  setSessionId: (sessionId: string) => void;
  setSelectedExample: (example: (typeof exampleFiles)[0] | null) => void;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [fileInfo, setFileInfo] = useState<{
    [key: string]: {
      chunks: number;
      status: string;
      error?: string;
    };
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeErrorFiles = () => {
    setFiles((prevFiles) => prevFiles.filter((file) => fileInfo[file.name]?.status !== "error"));
    setFileInfo((prevInfo) => {
      const newInfo = { ...prevInfo };
      Object.keys(newInfo).forEach((fileName) => {
        if (newInfo[fileName].status === "error") {
          delete newInfo[fileName];
        }
      });
      return newInfo;
    });
  };

  const handleFileChange = async (newFiles: File[]) => {
    removeErrorFiles();
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange && onChange(newFiles);

    for (const file of newFiles) {
      if (file.type === "test") {
        setFileInfo((prev) => ({
          ...prev,
          [file.name]: { chunks: 129, status: "success" },
        }));
        setFiles([
          new File(new Array(777777).fill("test"), file.name, { type: "application/pdf" }),
        ]);

        toast.success(`Successfully uploaded ${file.name}`);

        return;
      }

      setFileInfo((prev) => ({
        ...prev,
        [file.name]: { chunks: 0, status: "Uploading..." },
      }));

      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("sessionId", sessionId);

      try {
        const response = await stream("/api/upload", {
          method: "POST",
          body: formData,
        });

        for await (const event of response) {
          const parsedChunk = JSON.parse(event?.data?.trim().replace(/^data:\s*/, "") || "");

          if (parsedChunk.error) {
            setFileInfo((prev) => ({
              ...prev,
              [file.name]: { chunks: 0, status: "error", error: parsedChunk.error },
            }));
            toast.error(parsedChunk.error);
            return;
          } else if (parsedChunk.chunks) {
            setFileInfo((prev) => ({
              ...prev,
              [file.name]: { chunks: parsedChunk.chunks.length, status: "success" },
            }));
            toast.success(`Successfully uploaded ${file.name}`);
          } else if (parsedChunk.message) {
            setFileInfo((prev) => ({
              ...prev,
              [file.name]: { chunks: 0, status: parsedChunk.message },
            }));
          }
        }
      } catch (error) {
        setFileInfo((prev) => ({
          ...prev,
          [file.name]: { chunks: 0, status: "error", error: "Network error" },
        }));
        toast.error(`Error uploading ${file.name}`);
      }
    }
  };

  const handleClick = () => {
    removeErrorFiles();
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: (error) => {
      console.log(error);
    },
  });

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="w-full" {...getRootProps()}>
        <motion.div
          onClick={handleClick}
          whileHover="animate"
          className="p-10 group/file block rounded-lg cursor-pointer w-full relative overflow-hidden border border-gray-200 dark:border-neutral-800"
        >
          <input
            ref={fileInputRef}
            id="file-upload-handle"
            type="file"
            onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
            className="hidden"
          />
          <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
            <GridPattern />
          </div>
          <div className="flex flex-col items-center justify-center">
            <p className="relative z-20 font-sans font-bold text-neutral-700 dark:text-neutral-300 text-base">
              Upload file
            </p>
            <p className="relative z-20 font-sans font-normal text-neutral-400 dark:text-neutral-400 text-base mt-2">
              Drag or drop your files here or click to upload
            </p>
            <div className="relative w-full mt-10 max-w-xl mx-auto">
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className={cn(
                  "relative group-hover/file:shadow-2xl z-40 bg-white dark:bg-neutral-900 flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md",
                  "shadow-[0px_10px_50px_rgba(0,0,0,0.1)]"
                )}
              >
                {isDragActive ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-neutral-600 flex flex-col items-center"
                  >
                    Drop it
                    <IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                  </motion.p>
                ) : (
                  <IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
                )}
              </motion.div>
              <motion.div
                variants={secondaryVariant}
                className="absolute opacity-0 border border-dashed border-sky-400 inset-0 z-30 bg-transparent flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md"
              ></motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      {files.length === 0 && (
        <div className="mt-2 text-sm text-gray-500 flex flex-col gap-0">
          <p>Try example documents:</p>
          {exampleFiles.map((example, index) => (
            <a
              key={index}
              href="#"
              className="text-blue-500 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setSessionId(example.sessionId);
                setSelectedExample(example);
                handleFileChange([
                  new File([example.name], example.fileName, {
                    type: "TEST",
                  }),
                ]);
              }}
            >
              {example.name}
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-8 border-t border-gray-200 dark:border-neutral-800 pt-6">
          <h3 className="font-semibold text-neutral-700 dark:text-neutral-300 mb-4">
            Uploaded Files
          </h3>
          <div className="space-y-3 overflow-y-auto max-h-64">
            {files.map((file, idx) => (
              <motion.div
                key={"file" + idx}
                layoutId={"file-upload-" + idx}
                className="bg-white dark:bg-neutral-900 p-3 rounded-md shadow-sm"
              >
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                  {fileInfo[file.name] &&
                    fileInfo[file.name].status === "success" &&
                    ` | ${fileInfo[file.name].chunks} chunks`}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{file.type}</p>
                {fileInfo[file.name] &&
                  fileInfo[file.name].status &&
                  fileInfo[file.name].status !== "success" && (
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 flex items-center">
                      <IconLoader2 className="animate-spin mr-1 h-3 w-3" />{" "}
                      {fileInfo[file.name] && fileInfo[file.name].status}
                    </p>
                  )}
                {fileInfo[file.name] && fileInfo[file.name].status === "error" && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                    Error: {fileInfo[file.name].error}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export function GridPattern() {
  const columns = 41;
  const rows = 11;
  return (
    <div className="flex bg-gray-100 dark:bg-neutral-900 flex-shrink-0 flex-wrap justify-center items-center gap-x-px gap-y-px  scale-105">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`w-10 h-10 flex flex-shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-gray-50 dark:bg-neutral-950"
                  : "bg-gray-50 dark:bg-neutral-950 shadow-[0px_0px_1px_3px_rgba(255,255,255,1)_inset] dark:shadow-[0px_0px_1px_3px_rgba(0,0,0,1)_inset]"
              }`}
            />
          );
        })
      )}
    </div>
  );
}
