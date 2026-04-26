// @ts-nocheck
import { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { base64Data, promptText } = await request.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      console.error("GEMINI_API_KEY is missing in Netlify Edge environment");
      return new Response(JSON.stringify({ 
        error: "GEMINI_API_KEY_MISSING", 
        message: "Please configure a valid GEMINI_API_KEY in the Environment Variables." 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Using v1beta
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64Data } },
            { text: promptText }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ 
        error: "GENERATE_FAILED", 
        message: errorData.error?.message || "Gemini API call failed" 
      }), { 
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: "SERVER_ERROR", 
      message: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
