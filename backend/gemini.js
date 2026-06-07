import axios from "axios"

const normalizeUserInput = (command, assistantName) => {
  const escapedName = assistantName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return command.replace(new RegExp(`^${escapedName}[,\\s]*`, "i"), "").trim() || command
}

const inferFallbackIntent = (command, assistantName) => {
  const userInput = normalizeUserInput(command, assistantName)
  const lowerInput = userInput.toLowerCase()
  const cleanSearchInput = (value, platform) =>
    value
      .replace(/^(search|play)\s+/i, "")
      .replace(new RegExp(`\\bon\\s+${platform}\\b`, "gi"), "")
      .replace(new RegExp(`\\b${platform}\\b`, "gi"), "")
      .trim() || value

  if (lowerInput.includes("weather")) {
    return {
      type: "weather-show",
      userInput,
      response: "opening weather",
    }
  }

  if (lowerInput.includes("calculator")) {
    return {
      type: "calculator-open",
      userInput,
      response: "opening calculator",
    }
  }

  if (lowerInput.includes("instagram")) {
    return {
      type: "instagram-open",
      userInput,
      response: "opening instagram",
    }
  }

  if (lowerInput.includes("facebook")) {
    return {
      type: "facebook-open",
      userInput,
      response: "opening facebook",
    }
  }

  if (lowerInput.includes("time")) {
    return {
      type: "get-time",
      userInput,
      response: "telling current time",
    }
  }

  if (lowerInput.includes("date")) {
    return {
      type: "get-date",
      userInput,
      response: "telling current date",
    }
  }

  if (lowerInput.includes("day")) {
    return {
      type: "get-day",
      userInput,
      response: "telling current day",
    }
  }

  if (lowerInput.includes("month")) {
    return {
      type: "get-month",
      userInput,
      response: "telling current month",
    }
  }

  if (lowerInput.includes("youtube")) {
    const searchInput = cleanSearchInput(userInput, "youtube")

    return {
      type: lowerInput.includes("play") ? "youtube-play" : "youtube-search",
      userInput: searchInput,
      response: lowerInput.includes("play") ? "playing on youtube" : "searching on youtube",
    }
  }

  if (lowerInput.includes("google") || lowerInput.includes("search")) {
    const searchInput = cleanSearchInput(userInput, "google")

    return {
      type: "google-search",
      userInput: searchInput,
      response: "searching on google",
    }
  }

  return {
    type: "general",
    userInput,
    response: "assistant is temporarily unavailable, please try again",
  }
}

const buildErrorResponse = (command, assistantName) =>
  JSON.stringify(inferFallbackIntent(command, assistantName))

const geminiResponse=async (command,assistantName,userName)=>{
try {
    const apiUrl=process.env.GEMINI_API_URL
    const prompt = `You are a virtual assistant named ${assistantName} created by ${userName}. 
You are not Google. You will now behave like a voice-enabled assistant.

Your task is to understand the user's natural language input and respond with a JSON object like this:

{
  "type": "general" | "google-search" | "youtube-search" | "youtube-play" | "get-time" | "get-date" | "get-day" | "get-month"|"calculator-open" | "instagram-open" |"facebook-open" |"weather-show"
  ,
  "userInput": "<original user input>" {only remove your name from userinput if exists} and agar kisi ne google ya youtube pe kuch search karne ko bola hai to userInput me only bo search baala text jaye,

  "response": "<a short spoken response to read out loud to the user>"
}

Instructions:
- "type": determine the intent of the user.
- "userinput": original sentence the user spoke.
- "response": A short voice-friendly reply, e.g., "Sure, playing it now", "Here's what I found", "Today is Tuesday", etc.

Type meanings:
- "general": if it's a factual or informational question. aur agar koi aisa question puchta hai jiska answer tume pata hai usko bhi general ki category me rakho bas short answer dena
- "google-search": if user wants to search something on Google .
- "youtube-search": if user wants to search something on YouTube.
- "youtube-play": if user wants to directly play a video or song.
- "calculator-open": if user wants to  open a calculator .
- "instagram-open": if user wants to  open instagram .
- "facebook-open": if user wants to open facebook.
-"weather-show": if user wants to know weather
- "get-time": if user asks for current time.
- "get-date": if user asks for today's date.
- "get-day": if user asks what day it is.
- "get-month": if user asks for the current month.

Important:
- Use ${userName} agar koi puche tume kisne banaya 
- Only respond with the JSON object, nothing else.


now your userInput- ${command}
`;





    const result=await axios.post(apiUrl,{
    "contents": [{
    "parts":[{"text": prompt}]
    }]
    })
const text = result?.data?.candidates?.[0]?.content?.parts?.[0]?.text
if(!text){
    return buildErrorResponse(command,assistantName)
}
return text
} catch (error) {
    return buildErrorResponse(command,assistantName)
}
}

export default geminiResponse
