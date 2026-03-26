import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'intelligence.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── CREATE TABLES ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'Other',
    impact TEXT DEFAULT 'Other',
    tags TEXT DEFAULT '',
    sources TEXT DEFAULT '[]',
    key_points TEXT DEFAULT '',
    submitted_by TEXT NOT NULL,
    reviewed_by TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    needs_review INTEGER DEFAULT 1,
    entry_type TEXT DEFAULT 'intelligence'
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_id TEXT REFERENCES insights(id) ON DELETE CASCADE,
    reviewer TEXT NOT NULL,
    summary TEXT DEFAULT '',
    key_points TEXT DEFAULT '',
    review_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_content TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    generated_by TEXT DEFAULT ''
  );
`);

// Migrations
try { db.exec(`ALTER TABLE insights ADD COLUMN reviewer_notes TEXT DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE insights ADD COLUMN reviewed_at TEXT DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN daily_token_limit INTEGER DEFAULT 100000`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN ai_blocked INTEGER DEFAULT 0`); } catch (_) {}

// Migrate ai_logs to remove CHECK constraint so agent/learn types are allowed
try {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_logs'").get();
  if (schema?.sql?.includes("'report','summary'")) {
    db.exec(`
      ALTER TABLE ai_logs RENAME TO ai_logs_old;
      CREATE TABLE ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        actor TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO ai_logs SELECT * FROM ai_logs_old;
      DROP TABLE ai_logs_old;
    `);
  }
} catch (_) {}

// Normalize verbose AI-generated category names to standard short values
try {
  db.exec(`
    UPDATE insights SET category = 'Model'    WHERE category LIKE 'Model%'    AND category != 'Model';
    UPDATE insights SET category = 'Tool'     WHERE category LIKE 'Tool%'     AND category != 'Tool';
    UPDATE insights SET category = 'Paper'    WHERE category LIKE 'Paper%'    AND category != 'Paper';
    UPDATE insights SET category = 'Use Case' WHERE category LIKE 'Use Case%' AND category != 'Use Case';
    UPDATE insights SET category = 'News'     WHERE category LIKE 'News%'     AND category != 'News';
    UPDATE insights SET category = 'Other'    WHERE category NOT IN ('Model','Tool','Paper','Use Case','News','Other');
  `);
} catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS panel_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    panel TEXT NOT NULL CHECK(panel IN ('ai_signal','financial_ai')),
    added_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    actor TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── LEARN AI RESOURCES ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS learn_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    url TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    resource_type TEXT DEFAULT 'website',
    difficulty TEXT DEFAULT 'Beginner',
    is_free INTEGER DEFAULT 1,
    added_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── LEARN STAGES ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS learn_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    difficulty_start TEXT DEFAULT 'Beginner',
    difficulty_end TEXT DEFAULT 'Beginner',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations for learn_resources (add stage_id + position)
try { db.exec(`ALTER TABLE learn_resources ADD COLUMN stage_id INTEGER`); } catch (_) {}
try { db.exec(`ALTER TABLE learn_resources ADD COLUMN position INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE learn_resources ADD COLUMN topics TEXT DEFAULT '[]'`); } catch (_) {}

// ─── LEARN WEEKS ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS learn_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_id INTEGER REFERENCES learn_stages(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    week_number INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations
try { db.exec(`ALTER TABLE learn_resources ADD COLUMN week_id INTEGER`); } catch (_) {}
try { db.exec(`ALTER TABLE learn_stages ADD COLUMN subtitle TEXT DEFAULT ''`); } catch (_) {}

// Seed 6 months + 24 weeks if weeks table is empty
try {
  const hasWeeks = db.prepare('SELECT id FROM learn_weeks LIMIT 1').get();
  if (!hasWeeks) {
    const insMonth = db.prepare(`INSERT INTO learn_stages (title, subtitle, position, difficulty_start, difficulty_end) VALUES (?, ?, ?, 'Beginner', 'Advanced')`);
    const insWeek = db.prepare(`INSERT INTO learn_weeks (month_id, title, description, week_number, position) VALUES (?, ?, ?, ?, ?)`);

    const seedRoadmap = db.transaction(() => {
      const months = [
        { title: 'Month 1', subtitle: 'Foundations', pos: 10 },
        { title: 'Month 2', subtitle: 'Core Machine Learning', pos: 11 },
        { title: 'Month 3', subtitle: 'Introduction to Deep Learning', pos: 12 },
        { title: 'Month 4', subtitle: 'Advanced Deep Learning & Projects', pos: 13 },
        { title: 'Month 5', subtitle: 'Advanced Generative AI and Portfolio Build', pos: 14 },
        { title: 'Month 6', subtitle: 'Project & Job Prep', pos: 15 },
      ];
      const weekData = [
        ['Month 1',1,'Python Basics','Master syntax, data types, OOP concepts, and standard libraries',0],
        ['Month 1',2,'Math for AI','Linear algebra (matrices, vectors), basic calculus (derivatives, gradients)',1],
        ['Month 1',3,'Probability & Statistics','Probability distributions, hypothesis testing, confidence intervals',2],
        ['Month 1',4,'Data Wrangling & EDA','Data cleaning, handling missing values, creating visualizations to spot trends',3],
        ['Month 2',5,'Supervised ML','Linear Regression, Logistic Regression, evaluation metrics',0],
        ['Month 2',6,'Advanced Algorithms','Support Vector Machines (SVM), Decision Trees, Random Forests, boosting (XGBoost/LightGBM)',1],
        ['Month 2',7,'scikit-learn & NLP Basics','Pipeline creation, K-Fold Cross Validation, Tokenization, lemmatization, TF-IDF, word embeddings',2],
        ['Month 2',8,'End-to-End ML Project','Customer Churn Prediction, Time Series Forecasting, Recommender System, or a chatbot with RASA NLU',3],
        ['Month 3',9,'Intro to Neural Networks','Perceptron, backpropagation, activation functions (ReLU, sigmoid, tanh)',0],
        ['Month 3',10,'Feedforward Networks','Multi-Layer Perceptrons (MLP), optimizers (SGD, Adam), regularization (dropout, batch normalization)',1],
        ['Month 3',11,'Fundamentals of CNNs & RNNs','Convolutions, pooling layers, building a simple image classifier, LSTMs, sequence modeling for text',2],
        ['Month 3',12,'Intro to PyTorch, TensorFlow & Project','PyTorch or TensorFlow, along with effective GPU utilization and CUDA basics',3],
        ['Month 4',13,'CNN Mini-Project','Build an image classifier (e.g., MNIST, CIFAR-10, or a custom dataset like Cats vs. Dogs)',0],
        ['Month 4',14,'Transfer Learning and Fine-Tuning','Using pretrained models (ResNet, VGG), leveraging existing weights to cut down on training time',1],
        ['Month 4',15,'Segmentation Fundamentals','Semantic segmentation (U-Net), evaluation metrics (IoU, Dice coefficient)',2],
        ['Month 4',16,'Object Detection & Keypoint Estimation','YOLO, Faster R-CNN for detection; Pose estimation frameworks like OpenPose',3],
        ['Month 5',17,'Model Deployment & Serving','Docker, Flask/FastAPI, TF Serving, or AWS SageMaker',0],
        ['Month 5',18,'Transformers & Diffusion Models','BERT, GPT fundamentals, attention mechanisms',1],
        ['Month 5',19,'Fine-Tuning a LoRA for LLM','LoRA (Low-Rank Adaptation) for more parameter-efficient fine-tuning of large models',2],
        ['Month 5',20,'GitHub Portfolio & LinkedIn','Building a strong GitHub portfolio and updating LinkedIn Profile',3],
        ['Month 6',21,'Build a Chatbot with RAG','Retrieval-Augmented Generation (pull data from knowledge bases), open-source LLM usage',0],
        ['Month 6',22,'Projects & Next Steps','Combine all your skills (CV, NLP, or end-to-end pipeline)',1],
        ['Month 6',23,'Interview Prep','Review core ML/DL concepts, System design for ML, Mock interviews',2],
        ['Month 6',24,'Networking & Community','Attend meetups, AI conferences, and open-source contributions',3],
      ];

      const monthIds = {};
      for (const m of months) {
        const r = insMonth.run(m.title, m.subtitle, m.pos);
        monthIds[m.title] = r.lastInsertRowid;
      }
      for (const [mt, wn, title, desc, pos] of weekData) {
        const mid = monthIds[mt];
        if (mid) insWeek.run(mid, title, desc, wn, pos);
      }
    });
    seedRoadmap();
    console.log('✅ Seeded 6 months + 24 weeks for AI Engineer Roadmap');
  }
} catch (e) {
  console.error('❌ Failed to seed roadmap:', e.message);
}

// Seed topics for existing resources by URL
const TOPICS_BY_URL = {
  'https://www.youtube.com/watch?v=aircAruvnKk': '["What is a neuron?","Weights and biases explained","Activation functions (sigmoid, ReLU)","Forward propagation","How networks learn","Gradient descent visualized"]',
  'https://www.elementsofai.com': '["What is AI vs rule-based systems?","Machine learning basics","Real-world AI applications","Neural networks intro","Ethics and societal impact of AI"]',
  'https://developers.google.com/machine-learning/crash-course': '["Framing ML problems","Linear regression","Reducing loss with gradient descent","Generalization & overfitting","Training & test sets","Intro to TensorFlow"]',
  'https://course.fast.ai': '["Image classification end-to-end","Data augmentation techniques","Transfer learning with pretrained models","NLP with transformers","Collaborative filtering"]',
  'https://www.youtube.com/@statquest': '["Statistics fundamentals","Linear & logistic regression","Decision trees & random forests","Clustering algorithms","Probability & distributions"]',
  'https://www.youtube.com/playlist?list=PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ': '["Micrograd: backprop from scratch","Bigram language model","Building MLP character models","Manual backpropagation","WaveNet implementation","GPT from scratch"]',
  'https://www.deeplearningbook.org': '["Linear algebra foundations","Probability & information theory","Deep feedforward networks","Regularization strategies","Optimization for deep models","Autoencoders & generative models"]',
  'https://jalammar.github.io/illustrated-transformer': '["Encoder-decoder architecture","Self-attention mechanism","Multi-head attention","Positional encoding","The attention score matrix"]',
  'https://huggingface.co/learn/nlp-course': '["Using pipelines for NLP","Fine-tuning with Trainer API","Datasets and tokenizers","Named entity recognition","Question answering","Text summarization"]',
  'https://arxiv.org/abs/1706.03762': '["Scaled dot-product attention","Multi-head attention mechanism","Positional encoding scheme","Encoder stack architecture","Decoder with masked attention","Training details & results"]',
  'https://cs231n.stanford.edu': '["Image classification pipeline","Loss functions & optimization","Backpropagation & neural nets","CNN architectures (AlexNet, VGG, ResNet)","Object detection & localization","Segmentation techniques"]',
  'https://www.youtube.com/watch?v=kCc8FmEb1nY': '["Tokenization basics","Building self-attention from scratch","Transformer blocks","Training a GPT on text data","Understanding model scaling"]',
  'https://www.promptingguide.ai': '["Zero-shot and few-shot prompting","Chain-of-thought prompting","ReAct framework","RAG (Retrieval-Augmented Generation)","Advanced: Tree of Thought","Safety & alignment prompting"]',
  'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab': '["Vectors and vector spaces","Linear combinations & span","Matrix multiplication as transformation","Determinants","Eigenvectors & eigenvalues","Dot products and duality"]',
  'https://www.coursera.org/specializations/mathematics-machine-learning': '["Linear algebra for ML","Multivariate calculus","Backpropagation mathematics","PCA (Principal Component Analysis)","Probability theory","Bayesian statistics"]',
  'https://aisafetyfundamentals.com': '["Why AI alignment is hard","Mesa-optimization & inner alignment","Interpretability research","AI governance and policy","Current safety research directions"]',
};

try {
  const updateTopics = db.prepare('UPDATE learn_resources SET topics = ? WHERE url = ? AND (topics IS NULL OR topics = \'[]\')');
  const seedTopics = db.transaction(() => {
    for (const [url, topics] of Object.entries(TOPICS_BY_URL)) {
      updateTopics.run(topics, url);
    }
  });
  seedTopics();
} catch (e) {
  console.error('Failed to seed topics:', e.message);
}

// Seed stages and resources
const SEED_STAGES = [
  ['AI Foundations',              'Start here. Build intuition for what AI is, how it learns, and why it matters.',                                     0, 'Beginner',     'Beginner'    ],
  ['Machine Learning Essentials', 'Core algorithms, tools, and workflows that power modern ML systems.',                                                  1, 'Beginner',     'Intermediate'],
  ['Deep Learning',               'Neural networks from the ground up — architecture, training, frameworks.',                                             2, 'Intermediate', 'Intermediate'],
  ['Natural Language Processing', 'How machines understand language — from embeddings to transformers.',                                                   3, 'Intermediate', 'Advanced'    ],
  ['Computer Vision',             'Teach machines to see — CNNs, detection, segmentation.',                                                               4, 'Intermediate', 'Intermediate'],
  ['Generative AI',               'LLMs, prompt engineering, diffusion models, building with AI APIs.',                                                   5, 'Intermediate', 'Advanced'    ],
  ['Mathematics for AI',          'The math behind ML — linear algebra, calculus, probability.',                                                          6, 'Beginner',     'Intermediate'],
  ['AI Ethics & Safety',          'Alignment, safety, fairness, and responsible AI development.',                                                         7, 'Intermediate', 'Intermediate'],
];

try {
  const hasStages = db.prepare("SELECT id FROM learn_stages LIMIT 1").get();
  if (!hasStages) {
    const insStage = db.prepare(`INSERT INTO learn_stages (title, description, position, difficulty_start, difficulty_end) VALUES (?, ?, ?, ?, ?)`);
    const seedStages = db.transaction(() => { for (const s of SEED_STAGES) insStage.run(...s); });
    seedStages();
    console.log(`✅ Seeded ${SEED_STAGES.length} default learn stages`);
  }
} catch (e) {
  console.error('❌ Failed to seed learn stages:', e.message);
}

try {
  const hasSysSeed = db.prepare("SELECT id FROM learn_resources WHERE added_by = 'system' LIMIT 1").get();
  if (!hasSysSeed) {
    const stageId = (title) => db.prepare("SELECT id FROM learn_stages WHERE title = ?").get(title)?.id || null;

    // [title, description, url, category, resource_type, difficulty, is_free, stage_id, position]
    const SEED_RESOURCES = [
      // AI Foundations
      ['3Blue1Brown – But what is a neural network?', 'The most-watched neural network explainer on YouTube. Beautiful animations, zero assumed knowledge. A perfect starting point for anyone.', 'https://www.youtube.com/watch?v=aircAruvnKk', 'AI Basics', 'video', 'Beginner', 1, stageId('AI Foundations'), 0],
      ['Elements of AI – University of Helsinki', 'Free online course designed for non-programmers. Covers AI ethics, ML basics, and neural networks in plain English. Taken by 1M+ people.', 'https://www.elementsofai.com', 'AI Basics', 'course', 'Beginner', 1, stageId('AI Foundations'), 1],
      // Machine Learning Essentials
      ['Google Machine Learning Crash Course', "Google's fast-paced intro to ML with TensorFlow. Covers regression, classification, neural nets, and best practices with real-world examples.", 'https://developers.google.com/machine-learning/crash-course', 'Machine Learning', 'course', 'Beginner', 1, stageId('Machine Learning Essentials'), 0],
      ['fast.ai – Practical Deep Learning for Coders', 'Top-down, code-first approach to deep learning. Taught by Jeremy Howard. One of the most beloved free ML courses in existence.', 'https://course.fast.ai', 'Machine Learning', 'course', 'Intermediate', 1, stageId('Machine Learning Essentials'), 1],
      ['StatQuest with Josh Starmer', 'YouTube channel that breaks down ML algorithms into simple, clear visual explanations. Great for demystifying statistics and ML math.', 'https://www.youtube.com/@statquest', 'Machine Learning', 'video', 'Beginner', 1, stageId('Machine Learning Essentials'), 2],
      // Deep Learning
      ['Neural Networks: Zero to Hero – Andrej Karpathy', 'Karpathy builds neural networks from scratch in Python — from a simple bigram model to a full GPT. The gold standard for understanding how it really works.', 'https://www.youtube.com/playlist?list=PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ', 'Deep Learning', 'playlist', 'Intermediate', 1, stageId('Deep Learning'), 0],
      ['Deep Learning Book – Goodfellow, Bengio & Courville', 'The definitive textbook on deep learning. Covers foundations, CNNs, RNNs, autoencoders, and generative models. Free to read online.', 'https://www.deeplearningbook.org', 'Deep Learning', 'website', 'Advanced', 1, stageId('Deep Learning'), 1],
      // Natural Language Processing
      ['The Illustrated Transformer – Jay Alammar', 'The clearest visual explanation of the transformer architecture ever written. If you only read one blog post on NLP, make it this one.', 'https://jalammar.github.io/illustrated-transformer', 'NLP', 'website', 'Intermediate', 1, stageId('Natural Language Processing'), 0],
      ['Hugging Face NLP Course', 'Hands-on NLP course using transformers and the HuggingFace ecosystem. Covers text classification, NER, QA, and fine-tuning.', 'https://huggingface.co/learn/nlp-course', 'NLP', 'course', 'Intermediate', 1, stageId('Natural Language Processing'), 1],
      ['Attention Is All You Need (Original Paper)', 'The 2017 Google Brain paper that introduced the transformer architecture — the foundation of every major LLM today including GPT and Gemini.', 'https://arxiv.org/abs/1706.03762', 'NLP', 'paper', 'Advanced', 1, stageId('Natural Language Processing'), 2],
      // Computer Vision
      ['Stanford CS231n – Convolutional Neural Networks', "Stanford's legendary computer vision course. Covers CNNs, object detection, segmentation, and generative models. Lecture videos freely available.", 'https://cs231n.stanford.edu', 'Computer Vision', 'course', 'Intermediate', 1, stageId('Computer Vision'), 0],
      // Generative AI
      ["Let's build GPT from scratch – Andrej Karpathy", 'Karpathy codes a full GPT model from scratch in 2 hours. One of the most educational AI videos ever made. Watch after the Zero to Hero series.', 'https://www.youtube.com/watch?v=kCc8FmEb1nY', 'GenAI', 'video', 'Intermediate', 1, stageId('Generative AI'), 0],
      ['Prompt Engineering Guide – DAIR.AI', 'Comprehensive, open-source guide to prompting LLMs effectively. Covers zero-shot, few-shot, chain-of-thought, RAG, and advanced techniques.', 'https://www.promptingguide.ai', 'GenAI', 'website', 'Beginner', 1, stageId('Generative AI'), 1],
      // Mathematics for AI
      ['3Blue1Brown – Essence of Linear Algebra', 'A visual playlist that gives deep intuition for vectors, matrices, and transformations — the math behind all of ML. Stunning animations.', 'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab', 'Mathematics', 'playlist', 'Beginner', 1, stageId('Mathematics for AI'), 0],
      ['Mathematics for Machine Learning – Coursera', 'Specialization from Imperial College London covering linear algebra, multivariate calculus, and PCA. Essential math foundation for ML.', 'https://www.coursera.org/specializations/mathematics-machine-learning', 'Mathematics', 'course', 'Intermediate', 0, stageId('Mathematics for AI'), 1],
      // AI Ethics & Safety
      ['AI Safety Fundamentals – BlueDot Impact', 'Free course on AI alignment and safety research. Covers why alignment matters, key research directions, and how the AI safety field works.', 'https://aisafetyfundamentals.com', 'Ethics & Safety', 'course', 'Intermediate', 1, stageId('AI Ethics & Safety'), 0],
    ];

    const ins = db.prepare(`INSERT INTO learn_resources (title, description, url, category, resource_type, difficulty, is_free, added_by, stage_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, 'system', ?, ?)`);
    const seedAll = db.transaction(() => { for (const r of SEED_RESOURCES) ins.run(...r); });
    seedAll();
    console.log(`✅ Seeded ${SEED_RESOURCES.length} default learn resources`);
  }
} catch (e) {
  console.error('❌ Failed to seed learn resources:', e.message);
}

export default db;
export { DB_PATH };
