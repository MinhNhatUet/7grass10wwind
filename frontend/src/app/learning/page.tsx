"use client";
import React, { useState } from "react";
import { 
  HelpCircle, Info, Plus, LayoutGrid, ChevronDown, 
  Trash2, Copy, Image as ImageIcon, ToggleRight, ToggleLeft
} from "lucide-react";

export default function QuizBuilderPage() {
  const [questions, setQuestions] = useState([
    { id: 1, complete: true },
    { id: 2, complete: false },
    { id: 3, complete: false },
    { id: 4, complete: false },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [timeLimit, setTimeLimit] = useState("30s");
  const [timeEnabled, setTimeEnabled] = useState(true);

  const times = [
    "5s", "10s", "15s", "20s", "25s", "30s", "45s", "60s",
    "75s", "90s", "1m 15s", "1m 30s", "2m", "2m 30s",
    "3m", "4m", "5m", "10m", "15m", "20m", "30m", "45m", "60m", "90m"
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-slate-800 font-sans p-6">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6 items-start">
        
        {/* LEFT COLUMN: Questions List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[calc(100vh-48px)] flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-lg">Questions (1453)</h2>
            <button className="text-slate-400 hover:text-slate-600">
              <LayoutGrid size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {questions.map((q, idx) => (
              <div 
                key={q.id} 
                onClick={() => setActiveId(q.id)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  activeId === q.id 
                    ? 'border-[#e0e7ff] bg-[#f0f5ff]' 
                    : 'border-transparent bg-[#f8fafc] hover:bg-slate-100'
                }`}
              >
                <div className="font-semibold text-sm mb-3">
                  {idx + 1} • {q.complete ? 'Complete' : 'Incomplete'}
                </div>
                {/* Visual mockup of question content */}
                <div className="space-y-2 opacity-40">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-300"></div>
                    <div className="h-2 bg-slate-300 rounded w-3/4"></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-300"></div>
                    <div className="h-2 bg-slate-300 rounded w-1/2"></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-300"></div>
                    <div className="h-2 bg-slate-300 rounded w-2/3"></div>
                  </div>
                </div>
                
                {activeId === q.id && (
                  <div className="mt-4 flex justify-center gap-4 text-slate-400">
                    <button className="hover:text-black transition-colors"><Copy size={16} /></button>
                    <button className="hover:text-black transition-colors"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
            <button className="w-full py-3 rounded-full border-2 border-black text-black font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
              <Plus size={18} /> Add Question
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: Editor */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-6">Question {activeId}</h2>
          
          <div className="space-y-4">
            {/* Question Input */}
            <div className="rounded-xl border border-slate-200 p-1 flex items-start focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
              <div className="p-3 text-slate-400">
                <HelpCircle size={20} />
              </div>
              <textarea 
                className="w-full p-3 pl-0 min-h-[100px] outline-none text-slate-700 resize-none bg-transparent"
                placeholder="Enter question"
              ></textarea>
            </div>

            {/* Image Banner */}
            <div className="bg-black rounded-xl p-4 flex items-center justify-between text-white shadow-md">
              <span className="text-sm font-medium">Choose image to add to this question (optional)</span>
              <button className="bg-white text-black px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-slate-100 transition-colors">
                Add image
              </button>
            </div>

            {/* Options */}
            <div className="space-y-3 pt-2">
              {['A', 'B', 'C', 'D'].map((letter, i) => (
                <div key={letter} className="flex items-center gap-3 rounded-xl border border-slate-200 p-1.5 focus-within:border-black transition-colors bg-white">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm ml-1 shrink-0">
                    {letter}
                  </div>
                  <input 
                    type="text" 
                    placeholder={`Enter option ${i + 1}`}
                    className="flex-1 p-2 outline-none text-slate-700 bg-transparent"
                  />
                  <div className="pr-3">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-black cursor-pointer transition-colors"></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Explanation */}
            <div className="rounded-xl border border-slate-200 p-1 flex items-start focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all mt-6">
              <div className="p-3 text-slate-400">
                <Info size={20} />
              </div>
              <textarea 
                className="w-full p-3 pl-0 min-h-[150px] outline-none text-slate-700 resize-none bg-transparent"
                placeholder="Enter explanation (optional)"
              ></textarea>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Settings */}
        <div className="space-y-6">
          {/* Specification */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-[16px] mb-5">Specification</h3>
            <div className="space-y-4">
              <div className="relative">
                <select className="w-full appearance-none rounded-xl border border-slate-200 p-3 text-sm text-slate-600 outline-none focus:border-[#4f2b96] bg-white">
                  <option>Exam</option>
                  <option>Midterm</option>
                  <option>Final</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select className="w-full appearance-none rounded-xl border border-slate-200 p-3 text-sm text-slate-600 outline-none focus:border-[#4f2b96] bg-white">
                  <option>Subject</option>
                  <option>Math</option>
                  <option>Computer Science</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select className="w-full appearance-none rounded-xl border border-slate-200 p-3 text-sm text-slate-600 outline-none focus:border-[#4f2b96] bg-white">
                  <option>Year</option>
                  <option>2024</option>
                  <option>2025</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Time Limit */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-[16px]">Time Limit</h3>
              <button 
                onClick={() => setTimeEnabled(!timeEnabled)}
                className={`transition-colors ${timeEnabled ? 'text-blue-600' : 'text-slate-300'}`}
              >
                {timeEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {times.map(t => (
                <button
                  key={t}
                  onClick={() => setTimeLimit(t)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                    timeLimit === t 
                      ? 'border-2 border-[#4f2b96] bg-white text-[#4f2b96]' 
                      : 'border-2 border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
