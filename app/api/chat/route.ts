import Groq from "groq-sdk";
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";

export const maxDuration = 30;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const groqMessages = messages.map((m: any) => {
      let content = "";
      
      if (m.parts && Array.isArray(m.parts)) {
        content = m.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
      } 
      else if (m.content) {
        content = m.content;
      }
      
      return {
        role: m.role,
        content: content || "",
      };
    }).filter((m: any) => m.content || m.role === "system");

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You're Sigma-AI! A smart AI model that answers questions of users. Be concise, helpful, and accurate.",
        },
        ...groqMessages,
      ],
      stream: true,
    });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let messageId: string | undefined;
      let hasStarted = false;

      try {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content;
          if (content !== undefined && content !== null) {
            if (!hasStarted) {
              messageId = generateId();
              writer.write({
                type: "text-start",
                id: messageId,
              });
              hasStarted = true;
            }
            if (content) {
              writer.write({
                type: "text-delta",
                delta: content,
                id: messageId!,
              });
            }
          }
        }
        if (hasStarted && messageId) {
          writer.write({
            type: "text-end",
            id: messageId,
          });
        }
      } catch (err) {
        console.error("Stream error:", err);
        throw err;
      }
    },
    onError: (error) => {
      console.error("Stream error:", error);
      return "An error occurred while processing your request.";
    },
    originalMessages: messages,
    generateId,
  });

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    console.error("API route error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

