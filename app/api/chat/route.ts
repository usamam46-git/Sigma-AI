import Groq from "groq-sdk";
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";
import { tavily } from "@tavily/core";

export const maxDuration = 30;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
const tvly = tavily({ apiKey: process.env.TVLY_API_KEY });
const tavilySearchTool = {
  type: "function" as const,
  function: {
    name: "tavily_search",
    description: "Search the web for real-time information. Use this tool when you need current information, recent events, or data that may have changed since your training.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant information on the web",
        },
        max_results: {
          type: "number",
          description: "Maximum number of search results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
};
async function executeTavilySearch(query: string, maxResults: number = 5) {
  try {
    const response = await tvly.search(query, {
      maxResults,
      includeAnswer: true,
      includeRawContent: false,
    });
    let result = `Search results for "${query}":\n\n`;
    
    if (response.answer) {
      result += `Answer: ${response.answer}\n\n`;
    }
    
    if (response.results && response.results.length > 0) {
      result += "Sources:\n";
      response.results.forEach((item, index: number) => {
        result += `${index + 1}. ${item.title}\n`;
        result += `   URL: ${item.url}\n`;
        if (item.content) {
          result += `   Content: ${item.content.substring(0, 200)}${item.content.length > 200 ? "..." : ""}\n`;
        }
        result += "\n";
      });
    } else {
      result += "No results found.\n";
    }
    
    return result;
  } catch (error) {
    console.error("Tavily search error:", error);
    return `Error performing web search: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Convert UI messages to Groq format
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
      
      if (m.role === "tool") {
        return {
          role: "tool" as const,
          content: content || "",
          tool_call_id: m.tool_call_id || m.toolCallId,
        };
      }
      
      return {
        role: m.role,
        content: content || "",
      };
    }).filter((m: any) => m.content || m.role === "system" || m.role === "tool");

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You're Sigma-AI! A smart AI model that answers questions of users. You have access to real-time web search through the tavily_search tool. Use it when you need current information or recent events. Be concise, helpful, and accurate.",
        },
        ...groqMessages,
      ],
      tools: [tavilySearchTool],
      tool_choice: "auto",
      stream: true,
    });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let messageId: string | undefined;
      let hasStarted = false;
      let accumulatedToolCalls: any[] = [];
      let conversationMessages = [...groqMessages];

      try {
        let finishReason: string | null = null;
        for await (const chunk of response) {
          const choice = chunk.choices[0];
          const delta = choice?.delta;
          const content = delta?.content;
          const toolCalls = delta?.tool_calls;
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
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
          if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
              const index = toolCall.index ?? 0;
              
              if (!accumulatedToolCalls[index]) {
                accumulatedToolCalls[index] = {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function?.name || "",
                    arguments: toolCall.function?.arguments || "",
                  },
                };
              } else {
                accumulatedToolCalls[index].function.arguments += toolCall.function?.arguments || "";
              }
            }
          }
        }
        
        const hasToolCalls = finishReason === "tool_calls" || accumulatedToolCalls.length > 0;
        
        if (hasToolCalls && accumulatedToolCalls.length > 0) {
          if (hasStarted && messageId) {
            writer.write({
              type: "text-end",
              id: messageId,
            });
          }

          const toolResults = await Promise.all(
            accumulatedToolCalls.map(async (toolCall) => {
              if (toolCall.function.name === "tavily_search") {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const result = await executeTavilySearch(
                    args.query,
                    args.max_results || 5
                  );
                  
                  return {
                    tool_call_id: toolCall.id,
                    role: "tool" as const,
                    content: result,
                  };
                } catch (error) {
                  console.error("Tool execution error:", error);
                  return {
                    tool_call_id: toolCall.id,
                    role: "tool" as const,
                    content: `Error executing search: ${error instanceof Error ? error.message : "Unknown error"}`,
                  };
                }
              }
              return null;
            })
          );

          // Filter out null results
          const validToolResults = toolResults.filter((r) => r !== null);

          // Add tool results to conversation
          conversationMessages.push(
            {
              role: "assistant",
              content: null,
              tool_calls: accumulatedToolCalls.map((tc) => ({
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            },
            ...validToolResults
          );
          const followUpResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "system",
                content:
                  "You're Sigma-AI! A smart AI model that answers questions of users. You have access to real-time web search through the tavily_search tool. Use it when you need current information or recent events. Be concise, helpful, and accurate. Use appropriate and relevant emojis for response if needed.",
              },
              ...conversationMessages,
            ],
            tools: [tavilySearchTool],
            tool_choice: "auto",
            stream: true,
          });

          messageId = generateId();
          hasStarted = false;

          for await (const chunk of followUpResponse) {
            const delta = chunk.choices[0]?.delta;
            const content = delta?.content;

            if (content !== undefined && content !== null) {
              if (!hasStarted) {
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

