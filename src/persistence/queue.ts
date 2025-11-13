import type { AgentState } from "../types/state.ts";
import type { HStore } from "@hstore/core";
import { appendState } from "./store.ts";
import debug from "debug";

const log = debug("agent:persistence:queue");

/**
 * 串行写入队列
 * 确保状态快照按事件顺序持久化
 */
export class PersistenceQueue {
  private store: HStore<AgentState>;
  private queue: AgentState[] = [];
  private processing = false;
  
  constructor(store: HStore<AgentState>) {
    this.store = store;
  }
  
  /**
   * 将状态推入队列
   */
  enqueue(state: AgentState): void {
    log("Enqueuing state");
    this.queue.push(state);
    this.process();
  }
  
  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }
    
    if (this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    try {
      while (this.queue.length > 0) {
        const state = this.queue.shift()!;
        log("Processing state from queue");
        
        try {
          await appendState(this.store, state);
          log("State persisted successfully");
        } catch (error) {
          log("Error persisting state:", error);
          // 将失败的状态重新放回队列
          this.queue.unshift(state);
          throw error;
        }
      }
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * 等待所有队列中的状态持久化完成
   */
  async flush(): Promise<void> {
    log("Flushing queue");
    
    while (this.queue.length > 0 || this.processing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    
    log("Queue flushed");
  }
  
  /**
   * 获取队列长度
   */
  get length(): number {
    return this.queue.length;
  }
  
  /**
   * 检查是否正在处理
   */
  get isProcessing(): boolean {
    return this.processing;
  }
}

