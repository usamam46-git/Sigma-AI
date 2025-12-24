# 🤖 Sigma AI (Text + Image Generation)

A **modern, open-source AI chatbot** that supports:
- 💬 Intelligent conversations using **LLaMA models via Groq**
- 🖼️ Image generation using **Google Gemini**
- 🔧 Tool calling (web search & real-time info) via **Tavily API**

Anyone can self-host and use this chatbot by adding their own API keys.

---

## ✨ Features

- ⚡ Ultra-fast responses powered by **Groq LLaMA models**
- 🖼️ AI image generation using **Gemini**
- 🔎 Tool calling & web search using **Tavily**
- 🧩 Modular and extensible architecture
- 🌐 Perfect for demos, portfolios, and production experiments
- 🔐 Secure API key handling via environment variables

---

## 🛠️ Tech Stack

- **LLM**: LLaMA (via Groq API)
- **Image Generation**: Google Gemini
- **Tool Calling / Web Search**: Tavily
- **Framework**: (Add your framework here — Next.js / React / Node, etc.)

---

## 🔑 Required API Keys

You need **exactly these three API keys**:

```env
GROQ_API_KEY=your_groq_api_key_here
TVLY_API_KEY=your_tavily_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
