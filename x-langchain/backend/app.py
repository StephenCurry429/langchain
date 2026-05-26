#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, current_dir)
sys.path.insert(0, os.path.join(current_dir, 'src'))

from dotenv import load_dotenv
load_dotenv()

from core import settings
from core import logger
from agents import agent_factory

app = FastAPI(title="X-LangChain API", description="LangChain 智能助手 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = None

class ChatRequest(BaseModel):
    message: str
    model_name: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    model: str

@app.on_event("startup")
async def startup_event():
    global agent
    try:
        model_name = os.getenv("MODEL_NAME", "mock")
        logger.info(f"正在初始化 Agent (使用 {model_name} 模型)...")
        if not settings.validate_model_config(model_name):
            raise ValueError(f"{model_name} 模型配置不完整")
        agent = agent_factory.create_agent(model_name)
        logger.info("Agent 初始化成功")
    except Exception as e:
        logger.error(f"Agent 初始化失败: {e}")
        raise

@app.get("/")
async def root():
    return {"message": "X-LangChain API 服务已启动"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": os.getenv("MODEL_NAME", "mock")}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not agent:
        raise HTTPException(status_code=500, detail="Agent 未初始化")
    
    try:
        logger.info(f"收到请求: {request.message[:50]}...")
        
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": request.message}]},
            config={"run_name": "API Chat"}
        )
        
        response = ""
        if isinstance(result, dict) and 'messages' in result:
            messages = result.get('messages', [])
            if messages:
                last_message = messages[-1]
                if hasattr(last_message, 'content'):
                    response = last_message.content
                elif isinstance(last_message, dict):
                    response = last_message.get('content', '')
        elif hasattr(result, 'content'):
            response = result.content
        else:
            response = str(result)
            
        return {"response": response, "model": os.getenv("MODEL_NAME", "mock")}
    
    except Exception as e:
        logger.error(f"处理请求时出错: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    if not agent:
        raise HTTPException(status_code=500, detail="Agent 未初始化")
    
    try:
        logger.info(f"收到流式请求: {request.message[:50]}...")
        
        from constants import STREAM_MODE_MESSAGES
        
        async for chunk in agent.astream(
            {"messages": [{"role": "user", "content": request.message}]},
            config={"run_name": "API Stream Chat"},
            stream_mode=STREAM_MODE_MESSAGES,
        ):
            if isinstance(chunk, tuple) and len(chunk) == 2:
                message_chunk, metadata = chunk
                if hasattr(message_chunk, "content") and message_chunk.content:
                    yield {"token": message_chunk.content, "done": False}
        
        yield {"token": "", "done": True}
    
    except Exception as e:
        logger.error(f"流式请求处理出错: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")