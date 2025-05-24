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

// Use OpenRouter API (free tier available)
async function rewriteWithOpenRouter(text, brandProfile, brandName) {
  const prompt = `You are a professional copywriter specializing in brand voice adaptation.

Your task: Rewrite the given text to perfectly match the specific brand voice described below.

BRAND: ${brandName}

BRAND VOICE GUIDELINES:
${brandProfile}

ORIGINAL TEXT:
"${text}"

INSTRUCTIONS:
- Study the brand voice guidelines carefully
- Rewrite the text to match the tone, style, vocabulary, and communication approach described
- Maintain the core message while transforming it to sound authentic to this brand
- Follow any specific rules, examples, or patterns mentioned in the guidelines
- Output ONLY the rewritten text, nothing else

REWRITTEN TEXT:`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || 'sk-or-v1-dummy'}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Brand Voice Rewriter'
      },
      body: JSON.stringify({
        model: 'microsoft/wizardlm-2-8x22b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('OpenRouter API error:', error);
    throw error;
  }
}

// Use Hugging Face with a text generation model
async function rewriteWithHuggingFace(text, brandProfile, brandName) {
  const prompt = `Rewrite this text in ${brandName} brand voice.

Brand guidelines: ${brandProfile.substring(0, 600)}

Original: "${text}"

Rewritten in ${brandName} voice:`;

  try {
    const models = [
      'microsoft/DialoGPT-large',
      'facebook/blenderbot-400M-distill',
      'google/flan-t5-large'
    ];
    
    for (const model of models) {
      try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 150,
              temperature: 0.8,
              do_sample: true,
              return_full_text: false
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          if (!data.error && Array.isArray(data) && data[0]?.generated_text) {
            let result = data[0].generated_text.trim();
            result = result.replace(prompt, '').trim();
            result = result.replace(/^["']|["']$/g, '');
            
            if (result.length > 10) {
              console.log(`Success with Hugging Face model: ${model}`);
              return result;
            }
          }
        }
      } catch (modelError) {
        continue;
      }
    }
    
    throw new Error('All Hugging Face models failed');
    
  } catch (error) {
    console.error('Hugging Face API error:', error);
    throw error;
  }
}

// Use Cohere API (has free tier)
async function rewriteWithCohere(text, brandProfile, brandName) {
  const prompt = `Brand Voice Guidelines for ${brandName}:

${brandProfile}

Task: Rewrite the following text to match the ${brandName} brand voice exactly as described above.

Original text: "${text}"

Rewritten text:`;

  try {
    const response = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.COHERE_API_KEY || 'dummy'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'command-light',
        prompt: prompt,
        max_tokens: 200,
        temperature: 0.7,
        stop_sequences: ["\n\n"]
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.generations[0].text.trim();
    
  } catch (error) {
    console.error('Cohere API error:', error);
    throw error;
  }
}

// Main rewrite function - tries multiple LLM APIs
async function rewriteText(text, brandProfile, brandName) {
  const apis = [
    { name: 'OpenRouter', fn: rewriteWithOpenRouter },
    { name: 'Cohere', fn: rewriteWithCohere },
    { name: 'HuggingFace', fn: rewriteWithHuggingFace }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API for ${brandName}...`);
      const result = await api.fn(text, brandProfile, brandName);
      
      if (result && result.length > 10 && result !== text) {
        console.log(`Success with ${api.name} API`);
        return result;
      }
    } catch (error) {
      console.log(`${api.name} API failed:`, error.message);
      continue;
    }
  }
  
  // If all LLM APIs fail, return original text with a note
  console.log('All LLM APIs failed');
  return `${text}\n\n[Note: Unable to connect to LLM services. Please check your internet connection or try again later.]`;
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
  console.log('\nTo get better results, set up a free API key:');
  console.log('- OpenRouter: https://openrouter.ai (free tier)');
  console.log('- Cohere: https://cohere.ai (free tier)');
  console.log('- Hugging Face: https://huggingface.co (completely free)');
});