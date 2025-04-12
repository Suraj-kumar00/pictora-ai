export class BaseModel {
  constructor() {}

  public async generateImage(prompt: string, modelId?: string): Promise<{ imageUrl: string; status: string }> {
    throw new Error("Method not implemented");
  }

  public async trainModel(zipUrl: string, triggerWord: string): Promise<void> {
    throw new Error("Method not implemented");
  }

  public async generateImageSync(prompt: string): Promise<{ imageUrl: string; status: string }> {
    throw new Error("Method not implemented");
  }
}