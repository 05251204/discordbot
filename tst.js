import "dotenv/config";
const { GEMINI_API_KEY } = process.env;

import { GoogleGenAI } from "@google/genai";

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({});

async function main() {
  const response_context = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents:
      "良い感じの二次元の女性の属性を一つ挙げてください（例：金髪ツインテール美少女）。その際、「了解しました。」などの文は一切出力せず、属性のみ出力してください。",
  });
  console.log(response_context.text);
  console.log("-------------------------");
  const response_hello = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `あなたは${response_context.text}で、友人を起こしに来ています。適切な文を一、二文ほど出力してください。その際、「了解しました。」などの文は一切出力せず、いきなり本文から初めてください。また、地の文は挿入せずセリフのみで構成してください。`,
  });
  console.log(response_hello.text);
}

main();
