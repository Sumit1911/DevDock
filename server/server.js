import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { promisify } from "util";
import os from 'os'
import fs from "fs";
import path from "path";

import express from "express";
import cors from "cors";

const app = express();
const PORT = 5000;

// Enhanced CORS configuration for Vite (port 5173) and Create React App (port 3000)
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const platform = os.platform();

const asyncExecute = promisify(exec);

const History = [];
const ai = new GoogleGenAI({ apiKey: "AIzaSyBRazK7fUrcZYrbjmWWDYBBkpTRN-J8Ql8" });

// Store the current project name
let currentProjectName = '';

async function executeCommand({command}) {
    try{
        const {stdout, stderr} = await asyncExecute(command);

        if(stderr){
            return `Error: ${stderr}`
        }

        return `Success: ${stdout} || Task executed completely`
    }
    catch(error){
        return `Error: ${error}`
    }
}

const executeCommandDeclaration = {
    name: "executeCommand",
    description:"Execute a single terminal/shell command. A command can be to create a folder, file, write on a file, edit the file or delete the file",
    parameters:{
        type:'OBJECT',
        properties:{
            command:{
                type:'STRING',
                description: 'It will be a single terminal command. Ex: "mkdir calculator"'
            },
        },
        required: ['command']   
    }
}

// Tool 2: Write content into a file
async function writeFile({ path, content }) {
    try {
        fs.writeFileSync(path, content, "utf-8");
        return `✅ File written successfully: ${path}`;
    } catch (error) {
        return `❌ Error writing file: ${error.message}`;
    }
}

const writeFileDeclaration = {
    name: "writeFile",
    description: "Create or overwrite a file with the given content",
    parameters: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "File path, e.g., 'website/index.html'"
            },
            content: {
                type: "string",
                description: "Content to write inside the file"
            }
        },
        required: ["path", "content"]
    }
};

const availableTools = {
    executeCommand,
    writeFile
};

async function runAgent(userProblem) {
    History.length = 0;
    
    // Generate a project name from the user problem
    const timestamp = Date.now();
    const projectName = `website_${timestamp}`;
    currentProjectName = projectName;
    
    History.push({
        role:'user',
        parts:[{text: `${userProblem}. Create the project with folder name: ${projectName}`}]
    });
    let stepCount = 0;
    while(true) {  
        stepCount++;
        if (stepCount > 4) {
            console.log("⚠️ Breaking loop after 10 steps to avoid hang");
            break;
        }
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: History,
            config: {
                systemInstruction: `
                    You are a Website Builder Expert. Your job is to generate the frontend of a website step by step, based on the user request.

                    💻 OS Detected: ${platform}

                    🔧 Tools you can use:
                    1. executeCommand → ONLY for creating project folders.
                      - Example: mkdir folderName
                    2. writeFile → To create and write HTML, CSS, or JS files with content(with full code).
                      - Example:
                        writeFile({ path: "website/index.html", content: "<!DOCTYPE html>...</html>" })
                        writeFile({ path: "website/style.css", content: "body { font-family: Arial; }" })
                        writeFile({ path: "website/script.js", content: "console.log('Hello');" })

                    📜 Rules for your workflow:
                    1. Analyze the user request (e.g. "Create a calculator website").
                    2. Create a project folder using executeCommand with the exact folder name provided by the user.
                    3. Inside that folder, create index.html, style.css, and script.js using writeFile (with full code).
                    4. Never use executeCommand to create empty files. Do not use ni, touch, fsutil, or echo.
                    5. All code must go inside the files using writeFile.
                    6. Work step by step (folder → files → code), and stop once files are written.
                    7. Make sure the HTML file includes proper links to CSS and JS files.
                    8. Create responsive, modern, and visually appealing websites.
                    9. Include interactive elements and animations where appropriate.

                    ⚠️ Important:
                    - executeCommand → ONLY for folders.
                    - writeFile → ALWAYS for files (creation + writing).
                    - Never leave files empty.
                    - Always use the exact project folder name provided in the user request.
                `,
                tools: [{
                    functionDeclarations: [executeCommandDeclaration, writeFileDeclaration]
                }],
            }
        });

        if(response.functionCalls&&response.functionCalls.length>0){
            console.log("⚡ Tool request:", response.functionCalls[0]);

            const {name,args} = response.functionCalls[0];
            const funCall =  availableTools[name];
            const result = await funCall(args);

            const functionResponsePart = {
                name: name,
                response: {
                    result: result,
                },
            };
           
            // model 
            History.push({
                role: "model",
                parts: [
                    {
                        functionCall: response.functionCalls[0],
                    },
                ],
            });

            History.push({
                role: "user",
                parts: [
                    {
                        functionResponse: functionResponsePart,
                    },
                ],
            });
        }
        else{
            History.push({
                role:'model',
                parts:[{text:response.text}]
            })
            console.log(response.text);
            break;
        }
    }
    
    return currentProjectName;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({ 
        status: "OK", 
        message: "Server is running",
        timestamp: new Date().toISOString()
    });
});

// New endpoint to serve the generated website files for frontend preview
app.get("/api/website/:projectName", async (req, res) => {
    const { projectName } = req.params;
    
    try {
        const projectPath = path.join(process.cwd(), projectName);
        console.log(`Looking for project at: ${projectPath}`);
        
        // Check if project directory exists
        if (!fs.existsSync(projectPath)) {
            console.log(`Project not found at: ${projectPath}`);
            return res.status(404).json({ 
                error: "Project not found",
                searchPath: projectPath,
                availableProjects: fs.readdirSync(process.cwd()).filter(item => 
                    fs.statSync(path.join(process.cwd(), item)).isDirectory() && 
                    item.startsWith('website_')
                )
            });
        }
        
        // Read HTML file
        const htmlPath = path.join(projectPath, 'index.html');
        const cssPath = path.join(projectPath, 'style.css');
        const jsPath = path.join(projectPath, 'script.js');
        
        let html = '';
        let css = '';
        let js = '';
        
        console.log(`Checking files in: ${projectPath}`);
        console.log(`Files in directory:`, fs.readdirSync(projectPath));
        
        if (fs.existsSync(htmlPath)) {
            html = fs.readFileSync(htmlPath, 'utf-8');
            console.log(`✅ HTML file loaded`);
        } else {
            console.log(`❌ HTML file not found at: ${htmlPath}`);
        }
        
        if (fs.existsSync(cssPath)) {
            css = fs.readFileSync(cssPath, 'utf-8');
            console.log(`✅ CSS file loaded`);
        }
        
        if (fs.existsSync(jsPath)) {
            js = fs.readFileSync(jsPath, 'utf-8');
            console.log(`✅ JS file loaded`);
        }
        
        // Inject CSS and JS into HTML for iframe display
        let combinedHtml = html;
        
        // If HTML doesn't have the CSS/JS links, inject them inline
        if (css && !html.includes('style.css')) {
            combinedHtml = combinedHtml.replace(
                /<\/head>/i,
                `<style>${css}</style>\n</head>`
            );
        }
        
        if (js && !html.includes('script.js')) {
            combinedHtml = combinedHtml.replace(
                /<\/body>/i,
                `<script>${js}</script>\n</body>`
            );
        }
        
        res.json({
            success: true,
            html: combinedHtml,
            css: css,
            js: js,
            projectName: projectName,
            projectPath: projectPath,
            files: {
                html: fs.existsSync(htmlPath),
                css: fs.existsSync(cssPath),
                js: fs.existsSync(jsPath)
            }
        });
        
    } catch (error) {
        console.error('Error reading website files:', error);
        res.status(500).json({ 
            error: "Failed to read website files",
            details: error.message,
            projectName: projectName
        });
    }
});

// Static file serving for generated websites (direct access)
app.use('/websites', express.static(process.cwd(), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Main generation endpoint - keeping your exact working logic
app.post("/api/generate", async (req, res) => {
    const {prompt} = req.body;
    
    console.log('🚀 Received request:', { prompt });
    
    if(!prompt) {
        console.log('❌ No prompt provided');
        return res.status(400).json({
            success: false,
            error: "Prompt is required"
        });
    }

    try {
        console.log('🤖 Starting website generation...');
        
        // Use your exact working runAgent function
        const projectName = await runAgent(prompt);
        
        console.log('✅ Website generated successfully:', projectName);
        
        // Verify files were created
        const projectPath = path.join(process.cwd(), projectName);
        const htmlPath = path.join(projectPath, 'index.html');
        const filesCreated = fs.existsSync(htmlPath);
        
        console.log(`Files verification - Project: ${projectPath}, HTML exists: ${filesCreated}`);
        
        res.json({
            success: true,
            message: "Website generated successfully!",
            projectName: projectName,
            details: `Website created in folder: ${projectName}`,
            projectPath: projectPath,
            filesCreated: filesCreated,
            directUrl: `http://localhost:${PORT}/websites/${projectName}/index.html`
        });
        
    } catch(error) {
        console.error('💥 Generation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            details: error.stack
        });
    }
});

// Endpoint to list all generated websites
app.get("/api/projects", (req, res) => {
    try {
        const projects = fs.readdirSync(process.cwd())
            .filter(item => {
                const itemPath = path.join(process.cwd(), item);
                return fs.statSync(itemPath).isDirectory() && item.startsWith('website_');
            })
            .map(projectName => {
                const projectPath = path.join(process.cwd(), projectName);
                const htmlExists = fs.existsSync(path.join(projectPath, 'index.html'));
                const cssExists = fs.existsSync(path.join(projectPath, 'style.css'));
                const jsExists = fs.existsSync(path.join(projectPath, 'script.js'));
                
                return {
                    name: projectName,
                    created: fs.statSync(projectPath).birthtime,
                    files: { html: htmlExists, css: cssExists, js: jsExists },
                    url: `http://localhost:${PORT}/websites/${projectName}/index.html`
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({
            success: true,
            projects: projects,
            total: projects.length
        });
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({
            success: false,
            error: "Failed to list projects",
            details: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/health',
            'POST /api/generate',
            'GET /api/website/:projectName',
            'GET /api/projects'
        ]
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🌐 CORS enabled for frontend integration`);
    console.log(`📁 Current working directory: ${process.cwd()}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});