const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store brand profiles in memory
let brandProfiles = {};

// Load brand profiles from the brand-profiles folder
function loadBrandProfiles() {
  const profilesDir = './brand-profiles';
  brandProfiles = {}; // Clear existing profiles
  
  try {
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir);
      
      files.forEach(file => {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
          try {
            const content = fs.readFileSync(path.join(profilesDir, file), 'utf8');
            const brandName = path.basename(file, path.extname(file));
            brandProfiles[brandName] = content;
            console.log(`Loaded brand profile: ${brandName}`);
          } catch (error) {
            console.error(`Error loading file ${file}:`, error.message);
          }
        }
      });
      
      console.log(`Total brand profiles loaded: ${Object.keys(brandProfiles).length}`);
    } else {
      console.log('brand-profiles directory does not exist');
    }
  } catch (error) {
    console.error('Error reading brand-profiles directory:', error.message);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Get all brand profiles
app.get('/api/brands', (req, res) => {
  loadBrandProfiles();
  
  const brands = Object.keys(brandProfiles).map(name => ({
    name,
    preview: brandProfiles[name].substring(0, 200) + '...'
  }));
  
  res.json(brands);
});

// Rewrite text using Groq API (free and fast)
async function rewriteWithGroq(text, brandProfile, brandName) {
  const prompt = `You are a professional copywriter. Rewrite the following text to match the exact brand voice and style described in the brand guide below.

BRAND VOICE GUIDE FOR ${brandName.toUpperCase()}:
${brandProfile}

ORIGINAL TEXT TO REWRITE:
"${text}"

INSTRUCTIONS:
- Rewrite the text to perfectly match the brand voice characteristics described above
- Follow all the guidelines, tone, and style rules from the brand guide
- Keep the core message and meaning intact
- Apply the specific vocabulary, sentence structure, and communication style outlined in the guide
- Output ONLY the rewritten text, no explanations or additional content

REWRITTEN TEXT:`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || 'gsk_dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Unknown API error');
    }

    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('Groq API error:', error);
    throw error;
  }
}

// Alternative: Use Hugging Face Inference API
async function rewriteWithHuggingFace(text, brandProfile, brandName) {
  const prompt = `Rewrite this text in ${brandName} brand voice based on these guidelines:

Brand Guidelines:
${brandProfile.substring(0, 500)}

Original: "${text}"

Rewritten:`;

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 150,
          temperature: 0.8,
          return_full_text: false
        }
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text.replace(prompt, '').trim();
    }
    
    throw new Error('No valid response from Hugging Face');
    
  } catch (error) {
    console.error('Hugging Face API error:', error);
    throw error;
  }
}

// Use free Together AI API
async function rewriteWithTogether(text, brandProfile, brandName) {
  const prompt = `You are an expert copywriter. Rewrite the following text to match the ${brandName} brand voice using the guidelines provided.

BRAND VOICE GUIDELINES:
${brandProfile}

TEXT TO REWRITE:
"${text}"

Rewrite this text following the brand guidelines exactly. Output only the rewritten text:`;

  try {
    const response = await fetch('https://api.together.xyz/inference', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY || 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'togethercomputer/llama-2-7b-chat',
        prompt: prompt,
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        repetition_penalty: 1,
        stop: ["\n\n"]
      }),
    });

    if (!response.ok) {
      throw new Error(`Together API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output?.choices?.[0]?.text?.trim() || data.choices?.[0]?.text?.trim() || '';
    
  } catch (error) {
    console.error('Together AI API error:', error);
    throw error;
  }
}

// Fallback to a local LLM-style transformation
function localLLMRewrite(text, brandProfile, brandName) {
  // This simulates what an LLM would do by analyzing the brand profile
  // and applying systematic transformations
  
  const profile = brandProfile.toLowerCase();
  let result = text;
  
  // Analyze brand profile for key transformation rules
  const isStraightforward = profile.includes('straightforward') || profile.includes('direct');
  const isSimple = profile.includes('simple') || profile.includes('plain english');
  const isActionOriented = profile.includes('action') || profile.includes('immediate');
  const isCasual = profile.includes('casual') || profile.includes('friendly');
  const isConfident = profile.includes('confident') || profile.includes('assured');
  
  // Apply transformations based on brand characteristics
  if (isStraightforward) {
    result = result.replace(/we are excited to announce/gi, '');
    result = result.replace(/we are pleased to inform you/gi, '');
    result = result.replace(/it is important to note/gi, '');
    result = result.replace(/please be advised/gi, '');
  }
  
  if (isSimple) {
    result = result.replace(/comprehensive/gi, 'complete');
    result = result.replace(/utilize/gi, 'use');
    result = result.replace(/facilitate/gi, 'help');
    result = result.replace(/innovative/gi, 'new');
    result = result.replace(/cutting-edge/gi, 'modern');
    result = result.replace(/revolutionary/gi, 'new');
  }
  
  if (isActionOriented) {
    result = result.replace(/will be able to/gi, 'can');
    result = result.replace(/in order to/gi, 'to');
    result = result.replace(/for the purpose of/gi, 'to');
  }
  
  if (isCasual) {
    result = result.replace(/Dear Sir\/Madam/gi, 'Hi');
    result = result.replace(/we would like to/gi, 'we\'d like to');
    result = result.replace(/do not/gi, 'don\'t');
    result = result.replace(/cannot/gi, 'can\'t');
  }
  
  if (isConfident) {
    result = result.replace(/might be able to/gi, 'can');
    result = result.replace(/we believe/gi, 'we know');
    result = result.replace(/perhaps/gi, '');
    result = result.replace(/possibly/gi, '');
  }
  
  // Clean up and format
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

// Main rewrite function
async function rewriteText(text, brandProfile, brandName) {
  // Try multiple LLM APIs in order of preference
  const apis = [
    { name: 'Groq', fn: rewriteWithGroq },
    { name: 'Together', fn: rewriteWithTogether },
    { name: 'HuggingFace', fn: rewriteWithHuggingFace }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API...`);
      const result = await api.fn(text, brandProfile, brandName);
      if (result && result.length > 10) {
        console.log(`Success with ${api.name} API`);
        return result;
      }
    } catch (error) {
      console.log(`${api.name} API failed:`, error.message);
      continue;
    }
  }
  
  // If all APIs fail, use local processing
  console.log('All APIs failed, using local processing');
  return localLLMRewrite(text, brandProfile, brandName);
}

// Rewrite endpoint
app.post('/api/rewrite', async (req, res) => {
  const { text, brandName } = req.body;
  
  if (!text || !brandName) {
    return res.status(400).json({ error: 'Text and brand name are required' });
  }
  
  if (!brandProfiles[brandName]) {
    return res.status(404).json({ error: `Brand profile '${brandName}' not found` });
  }
  
  try {
    const brandProfile = brandProfiles[brandName];
    const rewrittenText = await rewriteText(text, brandProfile, brandName);
    
    res.json({ 
      originalText: text,
      rewrittenText: rewrittenText,
      brandName: brandName
    });
  } catch (error) {
    console.error('Rewrite error:', error);
    res.status(500).json({ error: 'Failed to rewrite text: ' + error.message });
  }
});

// Initialize and start server
loadBrandProfiles();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Loaded ${Object.keys(brandProfiles).length} brand profiles`);
  console.log('Available brands:', Object.keys(brandProfiles).join(', '));
});