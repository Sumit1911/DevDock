import React, { useState, useRef, useEffect } from 'react';
import { 
  Code, 
  Eye, 
  Maximize2, 
  Download, 
  Upload, 
  Github, 
  Play, 
  Loader2,
  FileText,
  Palette,
  Zap,
  Settings,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';

const WebsiteBuilder = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeView, setActiveView] = useState('preview'); // 'code' or 'preview'
  const [activeFile, setActiveFile] = useState('html');
  const [generatedCode, setGeneratedCode] = useState({
    html: '',
    css: '',
    js: ''
  });
  const [projectSummary, setProjectSummary] = useState('');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);
  
  // API integration with your Gemini backend
  const generateWebsite = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setActiveView('code');
    setGeneratedCode({ html: '', css: '', js: '' });
    setProjectSummary('');
    
    try {
      const response = await fetch('/api/generate-website', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          streaming: true
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'file_created') {
                const { filename, content } = data;
                if (filename.endsWith('.html')) {
                  setGeneratedCode(prev => ({ ...prev, html: content }));
                } else if (filename.endsWith('.css')) {
                  setGeneratedCode(prev => ({ ...prev, css: content }));
                } else if (filename.endsWith('.js')) {
                  setGeneratedCode(prev => ({ ...prev, js: content }));
                }
              } else if (data.type === 'summary') {
                setProjectSummary(data.content);
              } else if (data.type === 'complete') {
                setIsGenerating(false);
                setActiveView('preview');
                break;
              } else if (data.type === 'error') {
                console.error('Generation error:', data.message);
                setIsGenerating(false);
                // Show error state
                setProjectSummary('❌ **Generation Error**: ' + data.message);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Network error:', error);
      setIsGenerating(false);
      setProjectSummary('❌ **Network Error**: Could not connect to the server. Please try again.');
    }
  };
  
  const updatePreview = () => {
    if (iframeRef.current && generatedCode.html) {
      const fullHtml = generatedCode.html.replace(
        '<link rel="stylesheet" href="styles.css">',
        `<style>${generatedCode.css}</style>`
      ).replace(
        '<script src="script.js"></script>',
        `<script>${generatedCode.js}</script>`
      );
      
      const blob = new URL.createObjectURL(
        new Blob([fullHtml], { type: 'text/html' })
      );
      iframeRef.current.src = blob;
    }
  };
  
  useEffect(() => {
    if (generatedCode.html && generatedCode.css && generatedCode.js) {
      updatePreview();
    }
  }, [generatedCode]);
  
  const openFullscreen = () => {
    if (generatedCode.html) {
      const fullHtml = generatedCode.html.replace(
        '<link rel="stylesheet" href="styles.css">',
        `<style>${generatedCode.css}</style>`
      ).replace(
        '<script src="script.js"></script>',
        `<script>${generatedCode.js}</script>`
      );
      
      const newWindow = window.open();
      newWindow.document.write(fullHtml);
      newWindow.document.close();
    }
  };
  
  const copyToClipboard = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };
  
  const deployToGitHub = async () => {
    if (!generatedCode.html || !generatedCode.css || !generatedCode.js) {
      alert('Please generate a website first!');
      return;
    }

    try {
      const response = await fetch('/api/deploy-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: prompt.split(' ').join('-').toLowerCase() || 'generated-website',
          files: {
            'index.html': generatedCode.html,
            'styles.css': generatedCode.css,
            'script.js': generatedCode.js,
            'README.md': `# Generated Website\n\nThis website was generated using AI Website Builder.\n\n## Description\n${prompt}\n\n## Files\n- index.html - Main HTML structure\n- styles.css - CSS styling\n- script.js - JavaScript functionality\n\n## How to run\n1. Clone this repository\n2. Open index.html in your browser\n3. Enjoy your website!`
          }
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const confirmDeploy = window.confirm(
          `Repository created successfully!\n\nRepo: ${data.repoUrl}\n\nWould you like to open GitHub to enable Pages deployment?`
        );
        
        if (confirmDeploy) {
          window.open(`${data.repoUrl}/settings/pages`, '_blank');
        }
      } else {
        alert(`GitHub deployment failed: ${data.error}`);
      }
    } catch (error) {
      alert('Network error: Could not deploy to GitHub');
      console.error('GitHub deployment error:', error);
    }
  };

  const deployToVercel = async () => {
    if (!generatedCode.html || !generatedCode.css || !generatedCode.js) {
      alert('Please generate a website first!');
      return;
    }

    try {
      // First, create a deployment package
      const response = await fetch('/api/prepare-vercel-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: prompt.split(' ').join('-').toLowerCase() || 'generated-website',
          files: {
            'index.html': generatedCode.html,
            'styles.css': generatedCode.css,
            'script.js': generatedCode.js,
            'vercel.json': JSON.stringify({
              "version": 2,
              "builds": [
                {
                  "src": "index.html",
                  "use": "@vercel/static"
                }
              ]
            }, null, 2)
          }
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Redirect to Vercel with the deployment URL
        const vercelDeployUrl = `https://vercel.com/import/git?s=${encodeURIComponent(data.repoUrl)}`;
        const confirmVercel = window.confirm(
          `Project prepared for Vercel deployment!\n\nThis will:\n1. Open Vercel deployment page\n2. Import your project from GitHub\n3. Deploy automatically\n\nContinue?`
        );
        
        if (confirmVercel) {
          window.open(vercelDeployUrl, '_blank');
        }
      } else {
        alert(`Vercel preparation failed: ${data.error}`);
      }
    } catch (error) {
      alert('Network error: Could not prepare Vercel deployment');
      console.error('Vercel deployment error:', error);
    }
  };
  
  const downloadProject = () => {
    // Create downloadable files
    const files = [
      { name: 'index.html', content: generatedCode.html },
      { name: 'styles.css', content: generatedCode.css },
      { name: 'script.js', content: generatedCode.js }
    ];
    
    files.forEach(file => {
      const blob = new Blob([file.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    });
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Website Builder</h1>
                <p className="text-sm text-gray-500">Generate websites from natural language</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Input Section */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex items-start space-x-4">
            <div className="flex-1">
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                Describe your website
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., Create a coding tutorial website with dark theme, course sections, and user authentication"
                className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                disabled={isGenerating}
              />
            </div>
            <button
              onClick={generateWebsite}
              disabled={isGenerating || !prompt.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2 mt-8"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Main Content */}
        {(generatedCode.html || isGenerating) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Code/Preview Section */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {/* Toolbar */}
                <div className="border-b bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setActiveView('code')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          activeView === 'code'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Code className="h-4 w-4 inline mr-1" />
                        Code
                      </button>
                      <button
                        onClick={() => setActiveView('preview')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          activeView === 'preview'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Eye className="h-4 w-4 inline mr-1" />
                        Preview
                      </button>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={openFullscreen}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        title="Open in new tab"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={downloadProject}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        title="Download files"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={deployToVercel}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        title="Deploy to Vercel"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        onClick={deployToGitHub}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        title="Deploy to GitHub"
                      >
                        <Github className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* File Tabs */}
                  {activeView === 'code' && (
                    <div className="flex items-center space-x-1 mt-3">
                      {['html', 'css', 'js'].map((file) => (
                        <button
                          key={file}
                          onClick={() => setActiveFile(file)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeFile === file
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                          }`}
                        >
                          {file.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="h-96">
                  {activeView === 'code' ? (
                    <div className="relative h-full">
                      {isGenerating && !generatedCode[activeFile] ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Generating {activeFile.toUpperCase()}...</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => copyToClipboard(generatedCode[activeFile])}
                            className="absolute top-4 right-4 z-10 p-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors"
                          >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <pre className="h-full overflow-auto p-4 bg-gray-900 text-gray-100 text-sm leading-relaxed">
                            <code>{generatedCode[activeFile]}</code>
                          </pre>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="h-full">
                      {isGenerating || !generatedCode.html ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Preparing preview...</p>
                          </div>
                        </div>
                      ) : (
                        <iframe
                          ref={iframeRef}
                          className="w-full h-full border-none"
                          title="Website Preview"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Summary Section */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Project Summary</h3>
                </div>
                
                {isGenerating ? (
                  <div className="space-y-3">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                    </div>
                  </div>
                ) : projectSummary ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm text-gray-700 whitespace-pre-line">
                      {projectSummary}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Generate a website to see the project summary.</p>
                )}
                
                {generatedCode.html && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
                    <div className="space-y-2">
                      <button
                        onClick={downloadProject}
                        className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download Files</span>
                      </button>
                      <button
                        onClick={deployToVercel}
                        className="w-full px-3 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Deploy to Vercel</span>
                      </button>
                      <button
                        onClick={deployToGitHub}
                        className="w-full px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
                      >
                        <Github className="h-4 w-4" />
                        <span>Deploy to GitHub</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Empty State */}
        {!generatedCode.html && !isGenerating && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Palette className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to build something amazing?</h3>
            <p className="text-gray-600 mb-6">Describe your website idea above and watch as AI generates a complete project for you.</p>
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Code className="h-4 w-4" />
                <span>Clean Code</span>
              </div>
              <div className="flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>Live Preview</span>
              </div>
              <div className="flex items-center space-x-1">
                <ExternalLink className="h-4 w-4" />
                <span>Vercel Deploy</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebsiteBuilder;