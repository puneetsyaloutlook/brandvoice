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
  // Reload brands each time to pick up new files
  loadBrandProfiles();
  
  const brands = Object.keys(brandProfiles).map(name => ({
    name,
    preview: brandProfiles[name].substring(0, 200) + '...'
  }));
  
  res.json(brands);
});

// Rewrite text using free Hugging Face API
async function rewriteWithHuggingFace(text, brandProfile, brandName) {
  const prompt = `Rewrite the following text to match the ${brandName} brand voice. The brand characteristics are: ${extractBrandCharacteristics(brandProfile).slice(0, 200)}...

Original text: "${text}"

Rewritten text:`;

  try {
    // Using Hugging Face's free inference API
    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No API key required for basic usage
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 150,
          temperature: 0.7,
          return_full_text: false
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    // Extract the generated text
    let generatedText = '';
    if (Array.isArray(data) && data[0] && data[0].generated_text) {
      generatedText = data[0].generated_text.replace(prompt, '').trim();
    } else if (data.generated_text) {
      generatedText = data.generated_text.replace(prompt, '').trim();
    }

    return generatedText || fallbackRewrite(text, brandProfile, brandName);
    
  } catch (error) {
    console.error('Hugging Face API error:', error);
    // Fallback to local processing
    return fallbackRewrite(text, brandProfile, brandName);
  }
}

// Enhanced fallback rewrite function
function fallbackRewrite(text, brandProfile, brandName) {
  let result = text;
  
  // Extract key characteristics from the brand profile
  const profile = brandProfile.toLowerCase();
  
  if (brandName.toLowerCase() === 'bingle') {
    // Apply Bingle-specific transformations
    result = applyBingleTransformations(text);
  } else {
    // Apply generic brand transformations based on profile content
    result = applyGenericTransformations(text, profile);
  }
  
  return result;
}

function applyBingleTransformations(text) {
  let result = text;
  
  // Replace corporate jargon with simple, direct language
  const bingleReplacements = {
    'comprehensive insurance solutions': 'car insurance',
    'comprehensive coverage': 'full cover',
    'innovative products': 'insurance',
    'cutting-edge technology': 'smart tech',
    'state-of-the-art': 'modern',
    'unparalleled value propositions': 'great value',
    'exceptional value': 'great value',
    'valued customers': 'customers',
    'esteemed clients': 'customers',
    'revolutionize your coverage experience': 'make insurance simple',
    'transform your insurance journey': 'make insurance easy',
    'leverage': 'use',
    'utilize': 'use',
    'facilitate': 'help',
    'unforeseen circumstances': 'unexpected problems',
    'unprecedented situation': 'unusual situation',
    'we regret to inform you': 'we need to tell you',
    'we are pleased to announce': 'we\'re announcing',
    'sincerely apologize': 'sorry',
    'any inconvenience this might cause': 'any hassle',
    'appreciate your patience': 'thanks for waiting',
    'challenging time': 'tough time',
    'difficult period': 'hard time',
    'specialized representatives': 'our team',
    'customer service specialists': 'our team',
    'within the next 24-48 business hours': 'within 2 days',
    'in due course': 'soon',
    'assist you with your concerns': 'help you',
    'address your inquiries': 'answer your questions',
    'premium insurance package': 'car insurance',
    'comprehensive policy': 'full cover',
    'extensive coverage options': 'different cover types',
    'wide range of benefits': 'lots of benefits',
    'flexible payment plans': 'payment options',
    'customized to meet your unique needs': 'that work for you',
    'tailored solutions': 'options that fit',
    'budget requirements': 'budget',
    'financial constraints': 'budget'
  };
  
  // Apply word/phrase replacements
  Object.keys(bingleReplacements).forEach(phrase => {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, bingleReplacements[phrase]);
  });
  
  // Make sentences more direct
  result = result.replace(/Due to the fact that/gi, 'Because');
  result = result.replace(/In order to/gi, 'To');
  result = result.replace(/For the purpose of/gi, 'To');
  result = result.replace(/We are excited to announce that/gi, '');
  result = result.replace(/We are pleased to inform you that/gi, '');
  result = result.replace(/It is important to note that/gi, '');
  result = result.replace(/Please be advised that/gi, '');
  
  // Remove redundant phrases
  result = result.replace(/\s+that will\s+/gi, ' that ');
  result = result.replace(/\s+which will\s+/gi, ' that ');
  result = result.replace(/at this point in time/gi, 'now');
  result = result.replace(/in the near future/gi, 'soon');
  
  // Clean up extra spaces and punctuation
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

function applyGenericTransformations(text, profile) {
  let result = text;
  
  // Apply transformations based on brand characteristics
  if (profile.includes('direct') || profile.includes('straightforward')) {
    result = result.replace(/we believe that/gi, '');
    result = result.replace(/it is our opinion that/gi, '');
    result = result.replace(/we think that/gi, '');
    result = result.replace(/in our view/gi, '');
  }
  
  if (profile.includes('friendly') || profile.includes('casual')) {
    result = result.replace(/Dear Sir\/Madam/gi, 'Hi');
    result = result.replace(/To Whom It May Concern/gi, 'Hi');
    result = result.replace(/Sincerely/gi, 'Thanks');
    result = result.replace(/Best regards/gi, 'Cheers');
  }
  
  if (profile.includes('simple') || profile.includes('clear')) {
    result = result.replace(/commence/gi, 'start');
    result = result.replace(/terminate/gi, 'end');
    result = result.replace(/assistance/gi, 'help');
    result = result.replace(/endeavor/gi, 'try');
  }
  
  return result;
}

// Rewrite text in brand voice
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
    let rewrittenText;
    
    // Try Hugging Face API first, fallback to local processing
    try {
      rewrittenText = await rewriteWithHuggingFace(text, brandProfile, brandName);
    } catch (error) {
      console.log('AI API not available, using enhanced fallback processing');
      rewrittenText = fallbackRewrite(text, brandProfile, brandName);
    }
    
    res.json({ 
      originalText: text,
      rewrittenText: rewrittenText,
      brandName: brandName,
      usingAI: false // Set to true when AI is working
    });
  } catch (error) {
    console.error('Rewrite error:', error);
    res.status(500).json({ error: 'Failed to rewrite text: ' + error.message });
  }
});

function extractBrandCharacteristics(profile) {
  const lines = profile.split('\n');
  const characteristics = [];
  
  lines.forEach(line => {
    if (line.includes('•') || line.includes('-') || line.includes('*')) {
      characteristics.push(line.trim());
    } else if (line.includes(':') && (line.includes('Positioning') || line.includes('Voice') || line.includes('Tone'))) {
      characteristics.push(line.trim());
    }
  });
  
  return characteristics.slice(0, 5).join('\n') || 'Brand characteristics applied from profile';
}

// Initialize and start server
loadBrandProfiles();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Loaded ${Object.keys(brandProfiles).length} brand profiles`);
  console.log('Available brands:', Object.keys(brandProfiles).join(', '));
});