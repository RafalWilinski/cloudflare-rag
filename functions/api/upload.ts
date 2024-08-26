/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getDocumentProxy, extractText } from "unpdf";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const request = ctx.request;

  if (request.method === "POST") {
    const formData = await ctx.request.formData();
    const file = formData.get("pdf");

    // Validate the file
    if (
      !file ||
      typeof file !== "object" ||
      !(file as any).arrayBuffer ||
      typeof (file as any).arrayBuffer !== "function"
    ) {
      return new Response("Please upload a PDF file.", { status: 400 });
    }

    const buffer = await (file as any).arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });

    // Ensure textContent is a string
    const textContent = Array.isArray(result.text) ? result.text.join(" ") : result.text;
    console.log({ textContent });
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(textContent);
    console.log({ chunks });

    const { data }: { data: number[][] } = await (ctx.env as any).AI.run(
      "@cf/baai/bge-large-en-v1.5",
      {
        text: chunks,
      }
    );
    console.log({ data });

    const vectorsInsertResult = await ctx.env.VECTORIZE_INDEX.insert(
      data.map((embedding, index) => ({
        id: `${+new Date()}-${file.name}-${index}`,
        values: embedding,
        namespace: "default",
        metadata: {
          text: chunks[index],
        },
      }))
    );
    console.log(vectorsInsertResult);

    const fileInfo = {
      name: file.name,
      type: file.type,
      size: file.size,
      chunks,
      vectorsInsertResult,
    };

    return new Response(JSON.stringify(fileInfo), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Expected a POST request with a file", { status: 400 });
};
