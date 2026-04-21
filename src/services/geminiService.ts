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
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing from the environment. AI features will not work until this is configured.");
    } else {
      console.log(`Arbiter Engine initialized with key (length: ${apiKey.length})`);
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

    const MAX_RETRIES = 2;
    let retryCount = 0;

    const executeRequest = async (): Promise<string> => {
      try {
        const isFirstMessage = this.chatHistory.length === 0;
        const contents = this.chatHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }));

        const parts = isFirstMessage 
          ? [
              { inlineData: this.pdfData },
              { text: `You are the lead Board Game Arbiter. I have provided the official rules. Your goal is to provide precise, final rulings based strictly on the text provided. If a rule is ambiguous, interpret it based on the game's intent as found in the text. If the information isn't there, state that the Arbiter cannot find a ruling in the provided text. \n\nRuling requested: ${question}` }
            ]
          : [{ text: question }];

        const stream = await this.ai.models.generateContentStream({
          model: MODEL_NAME,
          contents: [...contents, { role: "user" as const, parts }],
          config: { temperature: 0.7 }
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
      } catch (error: any) {
        // Check for transient 503 errors (High Demand)
        const is503 = error?.message?.includes("503") || error?.stack?.includes("503");
        
        if (is503 && retryCount < MAX_RETRIES) {
          retryCount++;
          console.warn(`Arbiter is overloaded (503). Retrying... Attempt ${retryCount}`);
          // Wait a second before retrying
          await new Promise(resolve => setTimeout(resolve, 1500));
          return executeRequest();
        }

        console.error("Gemini Error:", error);
        throw error;
      }
    };

    return executeRequest();
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

  async generateSetupGuide(onUpdate?: (text: string) => void) {
    const prompt = `Please generate a detailed 'How to Set Up' guide for this board game. 
    Focus exclusively on:
    1. Player counts and specific setup variations for different numbers of players.
    2. Component placement (board, cards, tokens).
    3. Hand and Deck preparation.
    4. Determining the first player.
    
    Structure it as a clear checklist.`;
    
    return this.askQuestion(prompt, onUpdate);
  }

  async generateFAQ(onUpdate?: (text: string) => void) {
    const prompt = `Based on the rulebook, what are the top 5-7 most frequently asked questions or common points of confusion? 
    Please present these as Question & Answer pairs. 
    Focus on:
    - Edge cases
    - Tricky timing issues
    - Often misinterpreted wording
    - "Can I do X?" type scenarios`;
    
    return this.askQuestion(prompt, onUpdate);
  }

  /**
   * Use Gemini's knowledge to find a stable logo URL for a board game.
   * Prefer Wikipedia or official sources for stability.
   */
  async findLogoUrl(gameName: string): Promise<string | null> {
    const prompt = `Perform a Google Search to find the DIRECT image URL (the actual .jpg, .png or .webp file) for the box art or logo of the board game "${gameName}" from BoardGameGeek.
    
    CRITICAL: YOU MUST FIND THE DIRECT CLOUD ASSET URL starting with "https://cf.geekdo-images.com/". 
    DO NOT return BoardGameGeek page URLs (e.g., boardgamegeek.com/image/...).
    
    Return ONLY the raw naked URL. If you cannot find a direct image link that starts with "https://cf.geekdo-images.com/", return "null".`;
    
    // Use generateContent with googleSearch tool for real-time accuracy
    try {
      const response = await this.ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });
      const text = response.text?.trim() || "";
      // Aggressively match the direct image URL from cloud asset
      const urlMatch = text.match(/https:\/\/cf\.geekdo-images\.com\/[^\s)]+/);
      return urlMatch ? urlMatch[0] : null;
    } catch (err) {
      console.error("findLogoUrl failed:", err);
      return null;
    }
  }

  getHistory() {
    return this.chatHistory;
  }
}

export const rulebookService = new RulebookService();
