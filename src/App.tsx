import React, { useState, useRef, useEffect } from 'react';
import { Upload, Clock, CheckCircle, XCircle, AlertCircle, Languages, ChevronLeft, ChevronRight, Flag, FileText, Lightbulb, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";

export default function ExamSimulator() {
  const [examConfig, setExamConfig] = useState(null);
  const [currentExam, setCurrentExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [results, setResults] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [isArabic, setIsArabic] = useState(false);
  const [showImmediateFeedback, setShowImmediateFeedback] = useState(true);
  const [randomOrder, setRandomOrder] = useState(false);
  const [shuffleChoices, setShuffleChoices] = useState(false);
  const [customNumQuestions, setCustomNumQuestions] = useState(40);
  const [customDuration, setCustomDuration] = useState(60);
  const [customPassingPercentage, setCustomPassingPercentage] = useState(60);
  const [showAbout, setShowAbout] = useState(false);
  const [showFileStructure, setShowFileStructure] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showAIConfigModal, setShowAIConfigModal] = useState(false);
  const [pdfNumQuestions, setPdfNumQuestions] = useState(10);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Centralized way to sync settings from a config object
  const applyConfigSettings = (config: any) => {
    if (!config) return;
    
    if (config.randomQuestionsOrder !== undefined) setRandomOrder(!!config.randomQuestionsOrder);
    else setRandomOrder(false);

    if (config.shuffleChoices !== undefined) setShuffleChoices(!!config.shuffleChoices);
    else setShuffleChoices(false);

    if (config.immediateFeedback !== undefined) setShowImmediateFeedback(!!config.immediateFeedback);
    else setShowImmediateFeedback(true);

    if (config.numberOfQuestions) setCustomNumQuestions(Math.min(config.numberOfQuestions, config.questionBank.length));
    if (config.durationMinutes) setCustomDuration(config.durationMinutes);
    if (config.passingPercentage) setCustomPassingPercentage(config.passingPercentage);
  };

  // Sync settings when exam config is loaded
  useEffect(() => {
    if (examConfig) {
      applyConfigSettings(examConfig);
    }
  }, [examConfig]);

  // Google Drive Integration States
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState("");
  
  const [showSplash, setShowSplash] = useState(true);

  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000); // عرض شاشة الترحيب لمدة 3 ثواني
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (examStarted && timeLeft > 0 && !showImmediateFeedback) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { finishExam(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [examStarted, timeLeft, showImmediateFeedback]);

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (!examStarted || !currentExam || currentExam.length === 0) return;
      if (event.key === 'ArrowRight' && currentQuestionIndex < currentExam.length - 1)
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      if (event.key === 'ArrowLeft' && currentQuestionIndex > 0)
        setCurrentQuestionIndex(currentQuestionIndex - 1);
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [examStarted, currentExam, currentQuestionIndex]);

  useEffect(() => {
    fetchExamsFromFolder();
  }, []);

  const fetchExamsFromFolder = async () => {
    setIsLoadingDrive(true);
    try {
      const response = await fetch('/api/drive/list');
      const data = await response.json();
      
      if (data.files) {
        setDriveFiles(data.files);
      } else if (data.error) {
        console.error('Drive API Error:', data.error);
        setUploadError(isArabic ? "فشل جلب الملفات من المجلد." : "Failed to fetch files from folder.");
      }
    } catch (error) {
      console.error('Error fetching drive files:', error);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const loadExamFromDrive = async (fileId) => {
    if (!fileId) return;
    setIsLoadingDrive(true);
    setIsLoadingFile(true);
    try {
      const response = await fetch(`/api/drive/download/${fileId}`);
      const config = await response.json();
      
      if (config.error) {
        const detail = config.details || config.msg || config.lastError || "";
        throw new Error(`${config.error}${detail ? ` (${detail})` : ""}`);
      }
      
      if (!config.questionBank || !Array.isArray(config.questionBank)) {
        // Deep check for nested data property
        const finalConfig = (config.data && config.data.questionBank) ? config.data : config;
        
        if (!finalConfig.questionBank) {
          let errorMsg = "Format Mismatch";
          if (config.errorMessage) errorMsg = `Server Error: ${config.errorMessage}`;
          else if (config.errorType) errorMsg = `Server Type: ${config.errorType}`;
          
          const keys = Object.keys(config).join(', ');
          const preview = JSON.stringify(config).substring(0, 100);
          throw new Error(`${errorMsg}. Keys: [${keys}]. Preview: ${preview}`);
        }
        
        applyConfigSettings(finalConfig);
        setExamConfig(finalConfig);
      } else {
        applyConfigSettings(config);
        setExamConfig(config);
      }
      setUploadError('');
    } catch (error: any) {
      console.error('Error loading exam from drive:', error);
      const errMsg = error.message || "";
      setUploadError(isArabic 
        ? `فشل تحميل الملف: ${errMsg.substring(0, 50)}` 
        : `Failed to load: ${errMsg.substring(0, 50)}`
      );
    } finally {
      setIsLoadingDrive(false);
      setTimeout(() => setIsLoadingFile(false), 800);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoadingFile(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target.result as string);
        if (!config.questionBank || !Array.isArray(config.questionBank)) throw new Error('No questionBank');
        
        // Sync settings first
        applyConfigSettings(config);
        
        // Then set the config
        setExamConfig(config);
        setUploadError('');
      } catch (err) {
        setUploadError(isArabic ? 'ملف غير صالح. تأكد من أنه بصيغة JSON صحيحة.' : 'Invalid JSON file');
      } finally {
        setTimeout(() => setIsLoadingFile(false), 1200);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset input
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsGeneratingExam(true);
    setGenerationProgress(0);
    setUploadError('');

    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        // Slow down randomly until it hits 95%
        if (prev >= 95) return 95;
        return prev + (Math.random() * 5);
      });
    }, 800);

    try {
      const getBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const base64Data = (await getBase64(file)) as string;
      
      const promptText = `I want you to act as an exam file generator. Provide STRICTLY valid JSON ONLY.
Extract exactly ${pdfNumQuestions} multiple-choice questions from the provided PDF document.

The JSON should match this exact structure:
{
  "examTitle": "Generated Exam from PDF",
  "numberOfQuestions": ${pdfNumQuestions},
  "durationMinutes": ${Math.round(pdfNumQuestions * 1.5)},
  "passingPercentage": 60,
  "questionBank": [
    {
      "id": "q1",
      "questionText": "Question text?",
      "choices": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": 0,
      "score": 1,
      "explanations": ["English: Reason 1 | Arabic: السبب 1", "English: Reason 2 | Arabic: السبب 2", "English: Reason 3 | Arabic: السبب 3", "English: Reason 4 | Arabic: السبب 4"],
      "referencePage": "Document Title | P.XX"
    }
  ]
}

Ensure "correctAnswer" is the 0-based index of the array "choices".
Generate exactly ${pdfNumQuestions} questions.
Explain ALL choices (both correct and wrong) with both an English and Arabic explanation combined as shown in the explanations template.
Identify the specific document section/title and the page number from the PDF where the question's topic is discussed, and formulate "referencePage" using " | " separators (e.g. "TOGAF Enterprise Architecture | Foundation Courseware | P.105").
Do NOT include markdown formatting like \`\`\`json - output pure JSON only.`;

      let jsonText = '';
      
      // Call server proxy for secure AI generation. This works in both AI Studio and Netlify.
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Data, promptText }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.message || errorData.error || "AI generation failed");
        } else {
          const errorBody = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorBody.substring(0, 100)}`);
        }
      }

      const data = await response.json();
      jsonText = data.text.trim();

      if (jsonText.startsWith('\`\`\`')) {
         jsonText = jsonText.replace(/^\`\`\`(json)?/, '').replace(/\`\`\`$/, '').trim();
      }

      const parsed = JSON.parse(jsonText);
      if (!parsed.questionBank) throw new Error("Invalid response format: missing questionBank");

      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated_exam_from_pdf_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err: any) {
      console.error(err);
      const detail = err.message ? `: ${err.message}` : "";
      setUploadError(isArabic 
        ? `حدث خطأ أثناء تحليل الملف بالذكاء الاصطناعي${detail}` 
        : `Error processing PDF via AI${detail}`
      );
    } finally {
      clearInterval(progressInterval);
      setGenerationProgress(100);
      setTimeout(() => {
        setIsGeneratingExam(false);
        setGenerationProgress(0);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
      }, 500);
    }
  };

  const startExam = () => {
    let allQuestions = [...examConfig.questionBank];
    if (randomOrder) allQuestions = allQuestions.sort(() => Math.random() - 0.5);
    const selectedQuestions = allQuestions.slice(0, customNumQuestions);
    
    const processedQuestions = selectedQuestions.map(originalQuestion => {
      const q = { ...originalQuestion };
      if (shuffleChoices) {
        const choicesWithData = q.choices.map((c, i) => ({ text: c, originalIndex: i, explanation: q.explanations[i] || '' }));
        const shuffled = choicesWithData.sort(() => Math.random() - 0.5);
        q.choices = shuffled.map(c => c.text);
        q.explanations = shuffled.map(c => c.explanation);
        q.correctAnswer = shuffled.findIndex(c => c.originalIndex === originalQuestion.correctAnswer);
      }
      return q;
    });

    setCurrentExam(processedQuestions);
    setAnswers({});
    setTimeLeft(customDuration * 60);
    setExamStarted(true);
    setExamFinished(false);
    setCurrentQuestionIndex(0);
  };

  const finishExam = () => {
    clearInterval(timerRef.current);
    setExamStarted(false);
    setExamFinished(true);
    let totalScore = 0;
    let earnedScore = 0;
    let wrongCount = 0;
    
    currentExam.forEach(question => {
      totalScore += question.score || 1;
      if (answers[question.id] === question.correctAnswer) {
        earnedScore += question.score || 1;
      } else {
        wrongCount++;
      }
    });

    const percentage = totalScore > 0 ? (earnedScore / totalScore) * 100 : 0;
    const passed = percentage >= customPassingPercentage;
    setResults({ totalScore, earnedScore, percentage: percentage.toFixed(2), passed, wrongCount });
  };

  const retakeWrongQuestions = () => {
    const wrongQuestions = currentExam.filter(question => answers[question.id] !== question.correctAnswer);
    if (wrongQuestions.length === 0) {
      alert(isArabic ? 'لا توجد أسئلة خاطئة لإعادتها!' : 'No wrong questions to retake!');
      return;
    }

    const processedQuestions = wrongQuestions.map(question => {
      const q = { ...question };
      if (shuffleChoices) {
        const choicesWithData = q.choices.map((c, i) => ({ text: c, originalIndex: i, explanation: q.explanations[i] || '' }));
        const shuffled = choicesWithData.sort(() => Math.random() - 0.5);
        q.choices = shuffled.map(c => c.text);
        q.explanations = shuffled.map(c => c.explanation);
        q.correctAnswer = shuffled.findIndex(c => c.originalIndex === question.correctAnswer);
      }
      return q;
    });

    setCurrentExam(processedQuestions);
    setAnswers({});
    setTimeLeft(customDuration * 60);
    setExamStarted(true);
    setExamFinished(false);
    setCurrentQuestionIndex(0);
    setResults(null);
  };

  const resetExam = () => {
    setExamConfig(null);
    setExamFinished(false);
    setResults(null);
    setAnswers({});
    setCurrentExam(null);
    setShowReview(false);
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerSelect = (questionId, choiceIndex) => {
    if (examFinished) return;
    if (showImmediateFeedback && answers[questionId] !== undefined) return;
    setAnswers(prev => ({ ...prev, [questionId]: choiceIndex }));
  };

  const ModalOptions = ({ show, onClose, title, children }) => {
    if (!show) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-2xl flex flex-col" style={{ width: '673px', height: '553px' }} onClick={e => e.stopPropagation()}>
          <div className="bg-white border-b border-gray-200 p-3 flex justify-between items-center rounded-t-lg flex-shrink-0">
            <h2 className="text-base font-bold">{title}</h2>
            <button className="text-gray-500 hover:text-gray-700 text-2xl" onClick={onClose}>&times;</button>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto flex-1 text-sm">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const renderModals = () => (
    <>
      <ModalOptions show={showAbout} onClose={() => setShowAbout(false)} title={isArabic ? "عن البرنامج" : "About"}>
        <h3 className="text-blue-600 font-bold mb-2">{isArabic ? "محاكي امتحانات عام" : "Generic Exam Simulator"}</h3>
        <p className="mb-4">{isArabic ? "هذا البرنامج مصمم ليناسب أي امتحان بصيغة JSON." : "This program is designed to support any exam via a custom JSON file."}</p>
        <h4 className="font-bold mb-2">✨ {isArabic ? "المميزات الرئيسية:" : "Key Features:"}</h4>
        <ul className="space-y-1 mb-4">
          {[
            "Complete loading from external file — no embedded data",
            "Random question selection from question bank",
            "Shuffle answer choices (random order)",
            "Automatic timer with termination on timeout",
            "Optional immediate feedback (can be enabled/disabled)",
            "Retake wrong questions only (dedicated button)",
            "Support for images in Base64 format",
            "Page references — display page number for each answer",
            "Comprehensive grading with colored explanations",
            "Pass/fail calculation (automatic based on percentage)",
            "Arabic & English full support",
            "Modern professional design (clear colors)",
            "Flexible settings (questions, duration, passing %)"
          ].map((feat, i) => (
            <li key={i} className="flex gap-2"><span className="text-blue-600">✓</span>{feat}</li>
          ))}
        </ul>
        <div className="text-center text-xs text-gray-500 mt-6 pb-2 border-t pt-4">
          <p>Version 4.5.4 | 2026-04-26</p>
          <a href="https://www.linkedin.com/in/ahmedtarekhasan/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mt-1 block font-semibold">
            🔗 {isArabic ? "تواصل مع المطور" : "Connect with Developer"}
          </a>
        </div>
      </ModalOptions>

      <ModalOptions show={showFileStructure} onClose={() => setShowFileStructure(false)} title={isArabic ? "هيكل ملف JSON" : "JSON File Structure"}>
        <div className="border-l-4 border-blue-500 pl-3 py-1 mb-4">
          <h4 className="font-bold">{isArabic ? "طريقة الاستخدام:" : "How to Use:"}</h4>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Create a JSON file containing exam data</li>
            <li>Upload via "Choose Exam File" button</li>
            <li>Review exam details and adjust settings</li>
            <li>Click "Start Exam"</li>
            <li>Answer the questions</li>
            <li>Review results and detailed corrections</li>
          </ol>
        </div>
        <div className="mb-4">
          <h4 className="font-bold mb-2">{isArabic ? "الحقول المطلوبة:" : "Required fields:"}</h4>
          <ul className="space-y-1">
            {['examTitle', 'numberOfQuestions', 'durationMinutes', 'passingPercentage', 'questionBank'].map(f => (
              <li key={f} className="flex gap-2"><span className="text-green-500">✓</span> <code className="bg-gray-100 px-1 rounded">{f}</code></li>
            ))}
          </ul>
        </div>
        <div className="border-l-4 border-blue-400 bg-blue-50 pl-3 py-2 mb-4 rounded-r">
          <h4 className="font-bold">{isArabic ? "ملاحظة هامة:" : "Important Note:"}</h4>
          <p className="mb-2 text-xs">3 settings NOT needed in JSON (controlled from UI):</p>
          <ul className="list-disc pl-5 text-xs">
            <li>Immediate Feedback</li>
            <li>Random Questions Order</li>
            <li>Shuffle Choices</li>
          </ul>
        </div>
        <pre className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap">
{`{
  "examTitle": "TOGAF Foundation Exam",
  "numberOfQuestions": 40,
  "durationMinutes": 60,
  "passingPercentage": 60,
  "questionBank": [
    {
      "id": "q1",
      "questionText": "What is 2+2?",
      "imageUrl": "data:image/png;base64,...",
      "choices": ["3", "4", "5", "6"],
      "correctAnswer": 1,
      "score": 2.5,
      "explanations": [
        "❌ Incorrect: 2+2 is not 3",
        "✅ Correct! 2+2 = 4",
        "❌ Incorrect: 2+2 is not 5",
        "❌ Incorrect: 2+2 is not 6"
      ],
      "referencePage": "P.145"
    }
  ]
}`}
        </pre>
        <p className="mt-2 text-xs text-gray-500 text-center">Note: <code className="bg-gray-100 px-1">imageUrl</code> and <code className="bg-gray-100 px-1">referencePage</code> are optional</p>
      </ModalOptions>

      <ModalOptions show={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={isArabic ? "مولد الامتحانات بالذكاء الاصطناعي" : "AI Exam Generator"}>
        <div className="border-l-4 border-blue-500 bg-blue-50 p-2 mb-3 rounded-r text-sm">
          <strong>💡 Tip:</strong> Ensure your source material is clear.
        </div>
        <div className="border-l-4 border-green-500 bg-green-50 p-2 mb-3 rounded-r text-sm">
          <strong>🖼️ Adding Images to Questions:</strong><br/>
          1. Go to <a href="https://www.base64-image.de/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">base64-image.de</a><br/>
          2. Convert your image.<br/>
          3. Paste the data URL into the `imageUrl` field.
        </div>
        <div className="flex justify-between items-center bg-gray-100 p-2 rounded-t font-semibold mt-4">
          <span>{isArabic ? "الـ Prompt:" : "The Prompt:"}</span>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(`I want you to act as an exam file generator that outputs only one JSON object in a very strict format.

Do not write any explanation outside the JSON.
Do not add comments.
Your whole response must be valid JSON and nothing else.

1) Overall JSON structure
Create a single root JSON object with the following keys:

{
  "examTitle": "TOGAF Foundation Exam - 40 Questions with Explanations",
  "language": "en",
  "numberOfQuestions": 40,
  "durationMinutes": 90,
  "passingPercentage": 60,
  "showImmediateFeedback": true,
  "questionBank": []
}

Use this template and adjust only when I explicitly tell you:
- examTitle: use this default, or replace with the exam title I give you.
- language: "en" for English; if I say the questions are in Arabic, use "ar".
- numberOfQuestions: must equal the actual number of questions you put in questionBank.
- durationMinutes: keep as given unless I request another value.
- passingPercentage: keep as given unless I request another value.
- showImmediateFeedback: true if the app should show correctness and explanation immediately after each question; otherwise false.
- questionBank: this is an array of all questions you generate.

2) Structure of each question in questionBank
{
  "id": "q1",
  "questionText": "",
  "choices": [],
  "correctAnswer": 0,
  "score": 2.5,
  "explanations": []
}

id: Must be "q1", "q2", "q3", … sequentially with no gaps or duplicates.
questionText: Full question text without "Item X / Question:" label.
choices: Array of strings, preserve original order, no A/B/C prefix.
correctAnswer: Zero-based index of the correct option.
score: Same for all questions (e.g. 2.5) unless I request otherwise.
explanations: Same length as choices. Correct = start with ✅ Correct!; Wrong = start with ❌ Incorrect!

3) Style rules for explanations
- "en": Clear simple English, 1–2 short sentences.
- "ar": Clear Arabic, light Egyptian style acceptable.

4) How to process my input
Extract: clean question text, all options in order.
Use answer key I provide (e.g. "1:C, 2:A") to determine correctAnswer index.
Generate original explanations for all options.

5) Strict output rules
Single valid JSON object. No extra keys. No duplicate keys.
numberOfQuestions must equal objects in questionBank.
No comments, no trailing commas, no text outside JSON.

6) What you should do now
When I paste the raw questions and answer key:
- Parse all questions and options.
- Build questionBank array with correct ids.
- Set numberOfQuestions to final count.
- Return only the final JSON object, nothing else.`);
              alert(isArabic ? '✅ تم النسخ!' : '✅ Copied!');
            }}
            className="flex items-center gap-1 text-green-700 bg-green-100 hover:bg-green-200 px-3 py-1 rounded transition-colors"
          >
            📋 {isArabic ? "نسخ" : "Copy"}
          </button>
        </div>
        <pre className="bg-gray-900 text-green-400 p-3 rounded-b font-mono text-xs max-h-80 overflow-x-auto whitespace-pre-wrap">
{`I want you to act as an exam file generator that outputs only one JSON object in a very strict format.

Do not write any explanation outside the JSON.
Do not add comments.
Your whole response must be valid JSON and nothing else.

1) Overall JSON structure
...
(Click Copy to get the full prompt)`}
        </pre>
      </ModalOptions>

      <ModalOptions show={showAIConfigModal} onClose={() => setShowAIConfigModal(false)} title={isArabic ? "إعدادات استخراج PDF" : "PDF Extraction Settings"}>
        <div className="mb-6">
          <label className="block text-gray-700 font-bold mb-2">
            {isArabic ? "كم عدد الأسئلة التي تريد استخراجها؟ (كحد أقصى 50)" : "How many questions do you want to extract? (Max 50)"}
          </label>
          <input 
            type="number" 
            min={1} 
            max={50} 
            value={pdfNumQuestions} 
            onChange={e => setPdfNumQuestions(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} 
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 font-semibold outline-none transition-colors"
          />
        </div>
        
        <button 
          onClick={() => {
            setShowAIConfigModal(false);
            pdfInputRef.current?.click();
          }}
          className="w-full bg-green-600 text-white font-bold py-4 rounded-lg hover:bg-green-700 transition-colors flex justify-center items-center gap-2 text-lg"
        >
          <FileText className="w-6 h-6" />
          {isArabic ? "اختيار ملف المادة (PDF) والبدء" : "Select Material PDF & Generate"}
        </button>
      </ModalOptions>
    </>
  );

  // Screen 1: Upload Screen
  if (examConfig === null) {
    return (
      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-8 overflow-hidden"
          >
            <div className="max-w-none w-full flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="relative group w-full flex justify-center px-4"
              >
                {/* تأثير الـ Glow خلف اللوجو */}
                <div className="absolute -inset-8 bg-gradient-to-r from-blue-600/25 to-purple-600/25 rounded-[3rem] blur-3xl opacity-50 transition duration-1000 group-hover:opacity-100"></div>
                
                <img 
                  src="https://i.ibb.co/rKGt0Vf0/Whats-App-Image-2026-04-19-at-20-26-40.png" 
                  alt="App Logo" 
                  className="relative w-auto h-auto max-w-[85vw] max-h-[76vh] object-contain rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.6)] border border-white/10"
                />
              </motion.div>
              
              <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 1, duration: 0.8 }}
                 className="-mt-4 relative z-10 flex flex-col items-center gap-4"
              >
                {/* نقاط التحميل المتحركة */}
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                      className="w-2 h-2 rounded-full bg-blue-500"
                    />
                  ))}
                </div>
                <div className="flex flex-col items-center">
                  <h2 className="text-white text-2xl font-bold tracking-tight mb-1">
                    {isArabic ? "محاكي الامتحانات" : "Exam Simulator"}
                  </h2>
                  <p className="text-slate-400 text-[11px] font-mono uppercase tracking-[0.3em]">VERSION 4.5.4</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="main" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 1 }}
            className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 relative"
          >
            <AnimatePresence>
              {isLoadingFile && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[90] flex flex-col items-center justify-center"
                >
                  <div className="flex gap-2 mb-4">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -15, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                        className="w-4 h-4 bg-blue-600 rounded-full"
                      />
                    ))}
                  </div>
                  <p className="text-blue-900 font-bold text-xl animate-pulse">
                    {isArabic ? "جاري التحميل..." : "Loading Exam..."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {renderModals()}
            <div className="max-w-md w-full bg-white rounded-lg shadow-2xl p-8 relative">
              <div className="absolute top-4 right-4 flex gap-1">
                <button onClick={() => setShowFileStructure(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="File Structure">
                  <FileText className="w-5 h-5 text-gray-600" />
                </button>
                <button onClick={() => setShowAIPrompt(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="AI Generator">
                  <Lightbulb className="w-5 h-5 text-gray-600" />
                </button>
                <button onClick={() => setShowAbout(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="About">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                </button>
                <button onClick={() => setIsArabic(!isArabic)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Language">
                  <Languages className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              
              <h1 className="text-3xl font-bold text-center mb-2 mt-8 text-blue-900">
                {isArabic ? "محاكي الامتحانات" : "Exam Simulator"}
              </h1>
              <p className="text-center text-gray-600 mb-8">
                {isArabic ? "اختر ملف الامتحان للبدء" : "Select your exam file to begin"}
              </p>

              {uploadError && (
                <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-center border-2 border-red-200">
                  {uploadError}
                </div>
              )}

              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <input type="file" accept=".pdf" className="hidden" ref={pdfInputRef} onChange={handlePdfUpload} />
              
              <div className="mb-6 space-y-3">
                <p className="text-gray-500 text-sm font-medium">
                  {isArabic ? "اختر امتحانًا محددًا مسبقًا:" : "Select Predefine Exam:"}
                </p>
                <div className="relative">
                  <select 
                    value={selectedDriveFile}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDriveFile(e.target.value);
                        loadExamFromDrive(e.target.value);
                      }
                    }}
                    disabled={isLoadingDrive}
                    className="w-full bg-white border-2 border-blue-500 text-blue-900 px-4 py-3 rounded-lg font-semibold outline-none appearance-none cursor-pointer disabled:bg-gray-100 disabled:border-gray-300 transition-all"
                  >
                    <option value="">
                      {isLoadingDrive 
                        ? (isArabic ? "جاري جلب الملفات..." : "Fetching files...") 
                        : (driveFiles.length > 0 
                            ? (isArabic ? "-- اختر امتحان من القائمة --" : "-- Select Exam from List --") 
                            : (isArabic ? "لا توجد ملفات متاحة" : "No files found"))}
                    </option>
                    {driveFiles.map(file => (
                      <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                     <div className="border-l pl-2 border-gray-300 h-6 flex items-center">
                       <ChevronRight className="w-5 h-5 text-blue-500 rotate-90" />
                     </div>
                  </div>
                </div>
                {driveFiles.length === 0 && !isLoadingDrive && (
                  <p className="text-[10px] text-gray-400 text-center">
                    {isArabic 
                      ? "تأكد من أن المجلد 'Anyone with the link can view'" 
                      : "Make sure folder is 'Anyone with the link can view'"}
                  </p>
                )}
              </div>

              <div className="relative flex items-center py-5">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink mx-4 text-gray-400 font-medium text-sm">
                  {isArabic ? "أو ارفع ملفك الخاص" : "OR Upload your own"}
                </span>
                <div className="flex-grow border-t border-gray-300"></div>
              </div>

              <button 
                onClick={() => setShowAIConfigModal(true)}
                disabled={isGeneratingExam}
                className={`px-6 py-3 rounded-lg font-semibold w-full flex items-center justify-center gap-2 transition-colors mb-3 ${
                  isGeneratingExam 
                    ? 'bg-green-400 text-white cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                }`}
              >
                {isGeneratingExam ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isArabic ? "جاري الإنشاء..." : "Generating..."}
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    {isArabic ? "إنشاء امتحان من PDF" : "Create Exam File from PDF"}
                  </>
                )}
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isGeneratingExam}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold w-full flex items-center justify-center gap-2 mb-3 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="w-5 h-5" />
                {isArabic ? "اختر ملف الامتحان" : "Choose Exam File"}
              </button>

              {isGeneratingExam && (
                <div className="mt-4 border border-green-100 p-4 rounded-lg bg-green-50/50">
                  <div className="flex justify-between text-xs text-gray-700 font-bold mb-2">
                    <span>{isArabic ? "جاري الإنشاء (قد يستغرق 1-2 دقيقة)" : "AI Processing (may take 1-2 mins)..."}</span>
                    <span>{Math.round(generationProgress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-green-500 h-2.5 rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                      style={{ width: `${generationProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_1s_infinite]" style={{ transform: 'skewX(-20deg)' }}></div>
                    </div>
                  </div>
                  {generationProgress >= 90 && (
                    <p className="text-[10px] text-green-700 font-semibold text-center mt-3 animate-pulse">
                      {isArabic ? "تتم الآن القراءة وتوليد الأسئلة، يرجى الانتظار..." : "Reading document & generating questions, please wait..."}
                    </p>
                  )}
                </div>
              )}
              
              <div className="text-xs text-gray-400 text-center mt-6">Version 4.5.4 | 2026-04-26</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Screen 2: Settings Screen
  if (!examStarted && !examFinished) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl flex flex-col" style={{ width: '670px', minHeight: '580px' }}>
          <div className="p-5 border-b flex-shrink-0 flex justify-between items-center">
            <h2 className="font-bold text-2xl truncate pr-4">{examConfig.examTitle}</h2>
            <button onClick={() => setIsArabic(!isArabic)} className="p-2 rounded-lg hover:bg-gray-100 flex-shrink-0">
              <Languages className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="flex-1 p-5 space-y-3 overflow-y-auto">
            {/* Number of Questions */}
            <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center border border-blue-100">
              <span className="font-semibold text-gray-800">{isArabic ? "عدد الأسئلة:" : "Number of Questions:"}</span>
              <input 
                type="number" 
                min={1} 
                max={examConfig.questionBank.length} 
                value={customNumQuestions}
                onChange={e => setCustomNumQuestions(Math.min(Math.max(1, parseInt(e.target.value) || 1), examConfig.questionBank.length))}
                className="w-20 px-3 py-1.5 border-2 border-blue-300 rounded-lg text-center font-semibold text-sm outline-none focus:border-blue-500"
              />
            </div>

            {/* Duration */}
            <div className={`bg-green-50 rounded-lg p-4 flex justify-between items-center border border-green-100 transition-opacity ${showImmediateFeedback ? 'opacity-40' : ''}`}>
              <span className="font-semibold text-gray-800">{isArabic ? "المدة:" : "Duration:"}</span>
              <input 
                type="number" 
                min={1} 
                value={customDuration}
                onChange={e => setCustomDuration(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={showImmediateFeedback}
                className="w-20 px-3 py-1.5 border-2 border-green-300 rounded-lg text-center font-semibold text-sm outline-none focus:border-green-500 disabled:bg-gray-100"
              />
            </div>

            {/* Immediate Feedback */}
            <div className="bg-purple-50 rounded-lg p-4 flex justify-between items-center border-2 border-purple-200">
              <span className="font-semibold text-gray-800">{isArabic ? "التفسير الفوري" : "Immediate Feedback"}</span>
              <button 
                onClick={() => setShowImmediateFeedback(!showImmediateFeedback)}
                className={`px-5 py-1.5 rounded-full font-bold transition-all text-sm ${showImmediateFeedback ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}
              >
                {showImmediateFeedback ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Random Order */}
            <div className="bg-orange-50 rounded-lg p-4 flex justify-between items-center border-2 border-orange-200">
              <div>
                <div className="font-semibold text-gray-800">{isArabic ? "ترتيب عشوائي للأسئلة" : "Random Questions Order"}</div>
                <div className="text-xs text-gray-500">{randomOrder ? 'Questions will be shuffled' : 'Original order'}</div>
              </div>
              <button 
                onClick={() => setRandomOrder(!randomOrder)}
                className={`px-5 py-1.5 rounded-full font-bold transition-all text-sm ${randomOrder ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}
              >
                {randomOrder ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Shuffle Choices */}
            <div className="bg-pink-50 rounded-lg p-4 flex justify-between items-center border-2 border-pink-200">
              <div>
                <div className="font-semibold text-gray-800">{isArabic ? "خلط الاختيارات" : "Shuffle Choices"}</div>
                <div className="text-xs text-gray-500">{shuffleChoices ? 'Options A/B/C/D randomized' : 'Original order'}</div>
              </div>
              <button 
                onClick={() => setShuffleChoices(!shuffleChoices)}
                className={`px-5 py-1.5 rounded-full font-bold transition-all text-sm ${shuffleChoices ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}
              >
                {shuffleChoices ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="p-5 flex-shrink-0 flex gap-4">
            <button 
              onClick={() => { setExamConfig(null); setUploadError(''); }}
              className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:border-gray-400 font-semibold text-base transition-colors"
            >
              {isArabic ? "تغيير" : "Change"}
            </button>
            <button 
              onClick={startExam}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold text-base hover:bg-blue-700 transition-colors"
            >
              {isArabic ? "بدء الامتحان" : "Start Exam"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper for Choice Styling
  const getChoiceStyles = (question, choiceIndex) => {
    const isSelected = answers[question.id] === choiceIndex;
    if (showImmediateFeedback && answers[question.id] !== undefined) {
      if (choiceIndex === question.correctAnswer) return "border-green-500 bg-green-50";
      if (isSelected) return "border-red-500 bg-red-50";
      return "border-gray-300 bg-gray-50 opacity-70";
    }
    if (isSelected) return "border-blue-700 bg-blue-50";
    return "border-gray-300 hover:border-gray-400";
  };

  // Screen 4 & 5 (Review and Results)
  if (examFinished && results) {
    if (showReview) {
      return (
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-lg shadow-xl p-6 mb-6 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">{isArabic ? "مراجعة الإجابات" : "Review Answers"}</h1>
                <p className="text-gray-600">{isArabic ? "النتيجة:" : "Score:"} {results.earnedScore} / {results.totalScore}</p>
              </div>
              <button 
                onClick={() => setShowReview(false)}
                className="text-blue-600 hover:text-blue-800 font-semibold bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded transition-colors"
              >
                {isArabic ? "← رجوع للنتائج" : "← Back to Results"}
              </button>
            </div>

            <div className="space-y-6">
              {currentExam.map((question, index) => {
                const isCorrect = answers[question.id] === question.correctAnswer;
                return (
                  <div key={question.id} className={`bg-white rounded-lg shadow-lg p-6 border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                        {index + 1}
                      </div>
                      {isCorrect ? <CheckCircle className="text-green-500 w-6 h-6" /> : <XCircle className="text-red-500 w-6 h-6" />}
                      <span className={`font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                        {isArabic ? (isCorrect ? 'صحيح' : 'خطأ') : (isCorrect ? 'Correct' : 'Incorrect')}
                      </span>
                      <span className="text-gray-500 text-sm ml-auto">{question.score || 1} points</span>
                    </div>

                    <div className="text-lg text-gray-800 mb-4 whitespace-pre-wrap">{question.questionText}</div>
                    
                    {question.imageUrl && (
                      <div className="mb-6 text-center">
                        <img src={question.imageUrl} alt="Question" className="max-w-full h-auto rounded-lg shadow-md border-2 border-gray-200 mx-auto" style={{ maxHeight: '300px' }} referrerPolicy="no-referrer" />
                      </div>
                    )}

                    <div className="space-y-3">
                      {question.choices.map((choice, i) => {
                        const isThisChoiceCorrect = i === question.correctAnswer;
                        const isUserChoice = answers[question.id] === i;
                        
                        let choiceClass = "border-gray-200 bg-gray-50";
                        if (isThisChoiceCorrect) choiceClass = "border-green-500 bg-green-50";
                        else if (isUserChoice) choiceClass = "border-red-500 bg-red-50";

                        return (
                          <div key={i} className={`p-4 rounded border-2 ${choiceClass}`}>
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    {isThisChoiceCorrect && <CheckCircle className="w-5 h-5 text-green-500" />}
                                    {isUserChoice && !isThisChoiceCorrect && <XCircle className="w-5 h-5 text-red-500" />}
                                    {!isThisChoiceCorrect && !isUserChoice && <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>}
                                </div>
                                <div className="flex-1">
                                    <span>{choice}</span>
                                    {question.explanations && question.explanations[i] && (
                                        <div className="text-sm mt-2 whitespace-pre-wrap text-right text-gray-700 font-medium bg-white/50 p-2 rounded" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>
                                            {question.explanations[i]}
                                        </div>
                                    )}
                                </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {question.referencePage && (
                      <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg inline-flex items-center gap-2">
                        <span>📖</span>
                        <span className="text-xs text-blue-600 font-semibold uppercase">{isArabic ? "المرجع" : "Reference"}</span>
                        <span className="text-sm text-blue-900 font-medium">{question.referencePage}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <button 
              onClick={() => setShowReview(false)}
              className="mt-6 w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
               {isArabic ? "← رجوع للنتائج" : "← Back to Results"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center mb-6">{isArabic ? "نتائج الامتحان" : "Exam Results"}</h1>
          
          <div className="flex justify-center mb-8">
            <div className={`inline-flex items-center gap-3 px-6 py-4 rounded text-2xl font-bold ${results.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {results.passed ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
              {results.passed ? (isArabic ? 'نجحت' : 'PASSED') : (isArabic ? 'رسبت' : 'FAILED')}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8 text-center text-2xl font-bold">
             <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-100">
                <div className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">{isArabic ? "النتيجة" : "Score"}</div>
                <div className="text-blue-600">{results.earnedScore} / {results.totalScore}</div>
             </div>
             <div className="bg-indigo-50 p-6 rounded-lg border-2 border-indigo-100">
                <div className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">{isArabic ? "النسبة" : "Percentage"}</div>
                <div className="text-indigo-600">{results.percentage}%</div>
             </div>
             <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-100">
                <div className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">{isArabic ? "المطلوب" : "Required"}</div>
                <div className="text-purple-600">{customPassingPercentage}%</div>
             </div>
          </div>

          {results.wrongCount > 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 mb-6 text-center shadow-sm">
              <div className="flex justify-center mb-2">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
              </div>
              <p className="font-bold text-lg text-yellow-800 mb-1 flex items-center justify-center gap-2">
                 {isArabic ? `عندك ${results.wrongCount} سؤال غلط` : `${results.wrongCount} incorrect question(s)`}
              </p>
              <p className="text-yellow-700 mb-4 text-sm">{isArabic ? "يمكنك مراجعة الإجابات أو إعادة الأسئلة الخاطئة." : "Review your answers or retake only the wrong questions."}</p>
              <button 
                onClick={() => setShowReview(true)}
                className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 font-semibold transition-colors"
              >
                 {isArabic ? "📋 مراجعة كل الأسئلة" : "📋 Review All Questions"}
              </button>
            </div>
          )}

          <div className={`grid gap-4 ${results.wrongCount > 0 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            <button 
              onClick={resetExam}
              className="bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 shadow-md"
            >
              🔄 {isArabic ? "امتحان جديد" : "New Exam"}
            </button>
            {results.wrongCount > 0 && (
              <button 
                onClick={retakeWrongQuestions}
                className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg hover:from-orange-700 hover:to-red-700 font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <AlertCircle className="w-6 h-6" />
                {isArabic ? `⚠️ إعادة الأسئلة الغلط (${results.wrongCount})` : `⚠️ Retake Wrong (${results.wrongCount})`}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: Exam Screen
  const currentQuestion = currentExam[currentQuestionIndex];
  const isAnswered = answers[currentQuestion.id] !== undefined;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-md z-10 flex-shrink-0">
        <h1 className="font-bold text-lg truncate pr-4">{examConfig.examTitle}</h1>
        {!showImmediateFeedback && (
          <div className={`flex items-center gap-2 bg-blue-950 px-4 py-1.5 rounded-full font-mono font-bold ${timeLeft < 300 ? 'text-red-300' : 'text-white'}`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-300 p-4 h-full overflow-y-auto flex-shrink-0">
          <h2 className="font-semibold mb-4 text-gray-700">{isArabic ? "قائمة الأسئلة" : "Question Palette"}</h2>
          <div className="grid grid-cols-5 gap-2">
            {currentExam.map((q, i) => {
              const answered = answers[q.id] !== undefined;
              let bg = "bg-gray-200 text-gray-700 hover:bg-gray-300";
              if (i === currentQuestionIndex) bg = "bg-blue-700 text-white ring-2 ring-blue-300 ring-offset-2";
              else if (showImmediateFeedback && answered) {
                bg = answers[q.id] === q.correctAnswer ? "bg-green-500 text-white" : "bg-red-500 text-white";
              }
              else if (!showImmediateFeedback && answered) {
                bg = "bg-blue-900 text-white";
              }
              return (
                <button 
                  key={q.id} 
                  onClick={() => setCurrentQuestionIndex(i)}
                  className={`w-10 h-10 rounded text-sm font-semibold transition-colors ${bg}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 p-8 overflow-y-auto bg-gray-100">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-end mb-2 text-sm text-gray-600 font-medium">
              <span>{isArabic ? `سؤال ${currentQuestionIndex + 1} من ${currentExam.length}` : `Question ${currentQuestionIndex + 1} of ${currentExam.length}`}</span>
              <span>{Object.keys(answers).length} {isArabic ? "تم الإجابة" : "answered"}</span>
            </div>
            <div className="bg-gray-300 rounded-full h-2 mb-6 overflow-hidden">
              <div 
                className="bg-blue-700 h-2 rounded-full transition-all duration-300 ease-in-out" 
                style={{ width: `${((currentQuestionIndex + 1) / currentExam.length) * 100}%` }}
              ></div>
            </div>

            <div className="bg-white rounded shadow p-8 mb-6 border border-gray-200">
              <div className="text-lg text-gray-800 leading-relaxed mb-6 whitespace-pre-wrap">{currentQuestion.questionText}</div>
              
              {currentQuestion.imageUrl && (
                <div className="mb-6 flex justify-center">
                  <img src={currentQuestion.imageUrl} alt="Question" className="max-w-full h-auto rounded-lg shadow-md border-2 border-gray-200" style={{ maxHeight: '400px' }} referrerPolicy="no-referrer" />
                </div>
              )}

              <div className="space-y-3 mb-4">
                {currentQuestion.choices.map((choice, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswerSelect(currentQuestion.id, i)}
                    disabled={isAnswered && showImmediateFeedback}
                    className={`w-full p-4 rounded border-2 text-left transition-all flex flex-col ${getChoiceStyles(currentQuestion, i)} disabled:cursor-default`}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${answers[currentQuestion.id] === i ? 'border-blue-600' : 'border-gray-400'}`}>
                        {answers[currentQuestion.id] === i && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full"></div>}
                      </div>
                      <span className="flex-1">{choice}</span>
                    </div>
                    {showImmediateFeedback && isAnswered && currentQuestion.explanations && currentQuestion.explanations[i] && (
                        <div className="mt-3 pl-8 text-sm whitespace-pre-wrap text-right text-gray-700 font-medium" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>
                            {currentQuestion.explanations[i]}
                        </div>
                    )}
                  </button>
                ))}
              </div>

              {showImmediateFeedback && isAnswered && currentQuestion.referencePage && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg shadow-sm mt-6 inline-flex gap-2 items-center">
                  <span className="text-xl">📖</span>
                  <span className="text-xs text-blue-600 font-semibold uppercase tracking-wider">{isArabic ? "المرجع" : "Reference"}</span>
                  <span className="text-sm text-blue-900 font-bold ml-1">{currentQuestion.referencePage}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200">
              <button 
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors flex items-center gap-2 font-semibold shadow-sm"
              >
                <ChevronLeft className="w-5 h-5" />
                {isArabic ? "السابق" : "Previous"}
              </button>

              {currentQuestionIndex < currentExam.length - 1 ? (
                <button 
                  onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                  className="px-6 py-3 bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors flex items-center gap-2 font-semibold shadow-sm"
                >
                  {isArabic ? "التالي" : "Next"}
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button 
                  onClick={finishExam}
                  className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2 font-bold shadow-lg"
                >
                  {isArabic ? "تسليم الامتحان" : "Submit Exam"}
                  <Flag className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
