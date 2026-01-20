/**
 * Video template system for FacelessForge.
 * Provides pre-built configurations for common video types to help users get started quickly.
 */

export const VIDEO_TEMPLATES = {
  educational: {
    id: 'educational',
    name: 'Educational Explainer',
    description: 'Perfect for teaching concepts, tutorials, and how-to videos',
    icon: '📚',
    category: 'education',
    defaults: {
      duration: 60,
      aspectRatio: '9:16',
      style: 'Clean minimalist design with smooth transitions, educational diagrams, and clear typography',
    },
    suggestions: {
      topics: [
        'Top 5 facts about [subject]',
        'How [process] works explained simply',
        'The history of [topic] in 60 seconds',
        'Why [phenomenon] happens - Science explained',
        'Quick guide to understanding [concept]',
      ],
      styles: [
        'Documentary style with professional narration',
        'Animated explainer with colorful graphics',
        'Whiteboard animation style',
      ],
    },
  },
  
  motivational: {
    id: 'motivational',
    name: 'Motivational Content',
    description: 'Inspiring quotes, success stories, and motivational messages',
    icon: '💪',
    category: 'lifestyle',
    defaults: {
      duration: 30,
      aspectRatio: '9:16',
      style: 'Cinematic visuals with epic landscapes, sunrise/sunset imagery, and inspirational atmosphere',
    },
    suggestions: {
      topics: [
        'Start your day with this mindset',
        'The one habit that changed everything',
        'Why successful people wake up early',
        'The power of consistent daily action',
        'What [famous person] taught me about success',
      ],
      styles: [
        'Epic cinematic with dramatic lighting',
        'Peaceful nature scenes with calm energy',
        'Urban lifestyle with dynamic editing',
      ],
    },
  },
  
  news_update: {
    id: 'news_update',
    name: 'News & Updates',
    description: 'Breaking news, current events, and trending topic summaries',
    icon: '📰',
    category: 'news',
    defaults: {
      duration: 45,
      aspectRatio: '9:16',
      style: 'Modern news graphics with clean typography, professional color scheme, and dynamic transitions',
    },
    suggestions: {
      topics: [
        'This just happened in [industry/field]',
        'Breaking: [topic] - What you need to know',
        'Weekly [industry] news roundup',
        'The latest updates on [trending topic]',
        'Why everyone is talking about [topic]',
      ],
      styles: [
        'Professional news broadcast style',
        'Modern infographic animations',
        'Breaking news urgency style',
      ],
    },
  },
  
  product_showcase: {
    id: 'product_showcase',
    name: 'Product Showcase',
    description: 'Product reviews, features highlights, and promotional content',
    icon: '🛍️',
    category: 'business',
    defaults: {
      duration: 45,
      aspectRatio: '9:16',
      style: 'Premium product photography style with sleek backgrounds, dynamic camera movements, and modern aesthetics',
    },
    suggestions: {
      topics: [
        'Unboxing the new [product]',
        '5 features you didn\'t know about [product]',
        '[Product] vs [Competitor] - Honest comparison',
        'Why I switched to [product]',
        'Is [product] worth it? Full review',
      ],
      styles: [
        'Premium Apple-style product shots',
        'Tech review studio lighting',
        'Lifestyle product integration',
      ],
    },
  },
  
  storytelling: {
    id: 'storytelling',
    name: 'Story & Narrative',
    description: 'Engaging stories, personal experiences, and narrative content',
    icon: '📖',
    category: 'entertainment',
    defaults: {
      duration: 60,
      aspectRatio: '9:16',
      style: 'Cinematic storytelling with dramatic lighting, emotional color grading, and immersive visuals',
    },
    suggestions: {
      topics: [
        'The day that changed my life',
        'A story you won\'t believe is true',
        'The mystery of [topic] revealed',
        'What happened when I tried [experience]',
        'The untold story of [subject]',
      ],
      styles: [
        'Cinematic drama with emotional depth',
        'Documentary-style authentic storytelling',
        'Mystery/thriller atmosphere',
      ],
    },
  },
  
  listicle: {
    id: 'listicle',
    name: 'Top Lists & Rankings',
    description: 'Top 5/10 lists, rankings, and compilation videos',
    icon: '🏆',
    category: 'entertainment',
    defaults: {
      duration: 60,
      aspectRatio: '9:16',
      style: 'Dynamic countdown style with bold typography, exciting transitions, and energetic visuals',
    },
    suggestions: {
      topics: [
        'Top 5 [category] you need to try',
        '10 things you\'re doing wrong in [activity]',
        'Best [products] of 2024 ranked',
        '5 [topic] that will blow your mind',
        'Ranking every [type] from worst to best',
      ],
      styles: [
        'Countdown with dramatic reveals',
        'Fast-paced highlight reel',
        'Comparison grid animations',
      ],
    },
  },
  
  tutorial: {
    id: 'tutorial',
    name: 'Quick Tutorial',
    description: 'Step-by-step guides and how-to content',
    icon: '🎓',
    category: 'education',
    defaults: {
      duration: 45,
      aspectRatio: '9:16',
      style: 'Clear instructional visuals with step-by-step graphics, numbered sequences, and helpful annotations',
    },
    suggestions: {
      topics: [
        'How to [task] in 3 simple steps',
        'Beginner\'s guide to [skill]',
        'Quick tip: [technique] made easy',
        'The right way to [activity]',
        '[Tool/App] tutorial for beginners',
      ],
      styles: [
        'Screen recording with annotations',
        'Step-by-step illustrated guide',
        'Before/after demonstration',
      ],
    },
  },
  
  fitness: {
    id: 'fitness',
    name: 'Fitness & Wellness',
    description: 'Workout tips, health advice, and wellness content',
    icon: '🏃',
    category: 'lifestyle',
    defaults: {
      duration: 45,
      aspectRatio: '9:16',
      style: 'High-energy fitness visuals with dynamic movement, gym aesthetics, and motivational energy',
    },
    suggestions: {
      topics: [
        '5-minute morning workout routine',
        'The exercise you\'re probably doing wrong',
        'Nutrition tips for better results',
        'Recovery secrets for faster gains',
        'Home workout without equipment',
      ],
      styles: [
        'Gym motivation with intense energy',
        'Outdoor fitness lifestyle',
        'Clean wellness aesthetics',
      ],
    },
  },
  
  tech_review: {
    id: 'tech_review',
    name: 'Tech & Gadgets',
    description: 'Technology reviews, gadget showcases, and tech news',
    icon: '💻',
    category: 'technology',
    defaults: {
      duration: 60,
      aspectRatio: '9:16',
      style: 'Futuristic tech aesthetics with neon accents, sleek product shots, and modern UI elements',
    },
    suggestions: {
      topics: [
        'This new [gadget] is a game-changer',
        '[Tech] features you didn\'t know existed',
        'Is [technology] the future?',
        'Best budget [category] in 2024',
        'Hidden [app/device] tricks',
      ],
      styles: [
        'Futuristic sci-fi aesthetics',
        'Clean minimal tech showcase',
        'Neon cyberpunk vibes',
      ],
    },
  },
  
  cooking: {
    id: 'cooking',
    name: 'Food & Recipes',
    description: 'Recipe videos, cooking tips, and food content',
    icon: '🍳',
    category: 'lifestyle',
    defaults: {
      duration: 45,
      aspectRatio: '9:16',
      style: 'Warm kitchen aesthetics with appetizing food photography, cozy lighting, and mouth-watering close-ups',
    },
    suggestions: {
      topics: [
        'Quick [dish] recipe in 60 seconds',
        'The secret to perfect [food]',
        'Budget meal under $[amount]',
        '[Cuisine] recipe everyone should try',
        'Kitchen hack that changed everything',
      ],
      styles: [
        'Overhead cooking shots',
        'Close-up food photography',
        'Cozy home kitchen vibes',
      ],
    },
  },
};

// Template categories for filtering
export const TEMPLATE_CATEGORIES = {
  education: { name: 'Education', icon: '📚' },
  lifestyle: { name: 'Lifestyle', icon: '🌟' },
  business: { name: 'Business', icon: '💼' },
  entertainment: { name: 'Entertainment', icon: '🎬' },
  technology: { name: 'Technology', icon: '💻' },
  news: { name: 'News', icon: '📰' },
};

/**
 * Get all templates
 */
export function getAllTemplates() {
  return Object.values(VIDEO_TEMPLATES);
}

/**
 * Get template by ID
 */
export function getTemplate(id) {
  return VIDEO_TEMPLATES[id] || null;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category) {
  return Object.values(VIDEO_TEMPLATES).filter(t => t.category === category);
}

/**
 * Get random topic suggestion from template
 */
export function getRandomTopicSuggestion(templateId) {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) return null;
  
  const topics = template.suggestions.topics;
  return topics[Math.floor(Math.random() * topics.length)];
}

/**
 * Get random style suggestion from template
 */
export function getRandomStyleSuggestion(templateId) {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) return null;
  
  const styles = template.suggestions.styles;
  return styles[Math.floor(Math.random() * styles.length)];
}

/**
 * Apply template defaults to form data
 */
export function applyTemplateDefaults(templateId, currentData = {}) {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) return currentData;
  
  return {
    ...currentData,
    duration: template.defaults.duration,
    aspectRatio: template.defaults.aspectRatio,
    style: template.defaults.style,
  };
}

export default {
  VIDEO_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  getRandomTopicSuggestion,
  getRandomStyleSuggestion,
  applyTemplateDefaults,
};
