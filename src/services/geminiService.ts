import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-3-flash-preview";

export interface Message {
  role: "user" | "model";
  content: string;
}

export class RulebookService {
  private ai: GoogleGenAI;
  private pdfData: { data: string; mimeType: string } | null = null;
  private chatHistory: Message[] = [];

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing from the environment. AI features will not work until this is configured.");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || "" });
  }

  setPDF(base64Data: string, mimeType: string = "application/pdf") {
    this.pdfData = { data: base64Data, mimeType };
    this.chatHistory = []; // Reset history for new PDF
  }

  async askQuestion(question: string, onUpdate?: (text: string) => void) {
    if (!this.pdfData) {
      throw new Error("No rulebook uploaded.");
    }

    try {
      // First message includes the PDF
      const isFirstMessage = this.chatHistory.length === 0;
      
      const contents = this.chatHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const currentParts: any[] = [{ text: question }];
      
      // Always include PDF in the first turn's parts if we were using generateContent
      // But for a chat, we can prepend the PDF to the message history or current message
      // Actually, best practice with Gemini Flash for long context is to provide the doc once.
      
      const parts = isFirstMessage 
        ? [
            { inlineData: this.pdfData },
            { text: `You are the lead Board Game Arbiter. I have provided the official rules. Your goal is to provide precise, final rulings based strictly on the text provided. If a rule is ambiguous, interpret it based on the game's intent as found in the text. If the information isn't there, state that the Arbiter cannot find a ruling in the provided text. \n\nRuling requested: ${question}` }
          ]
        : [{ text: question }];

      const stream = await this.ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: [...contents, { role: "user" as const, parts }],
        config: {
          temperature: 0.7,
        }
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          onUpdate?.(fullResponse);
        }
      }

      this.chatHistory.push({ role: "user", content: question });
      this.chatHistory.push({ role: "model" as const, content: fullResponse });
      
      return fullResponse;
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }

  async generateQuickStart(onUpdate?: (text: string) => void) {
    const prompt = `Please generate a 'Quick Start' guide for this board game based on the uploaded rulebook. 
    The guide MUST be in a step-by-step format and cover:
    1. Game Objective (How do you win?)
    2. Setup (Steps to get the table ready)
    3. Turn Structure (What does a player do on their turn?)
    4. Most Critical Rules (The essential "don't forget" mechanics needed to start playing right away).
    
    Use clear headings and bullet points. Be concise but thorough. Focus on helping players start their first game as quickly as possible.`;
    
    return this.askQuestion(prompt, onUpdate);
  }

  getHistory() {
    return this.chatHistory;
  }
}

export const rulebookService = new RulebookService();
