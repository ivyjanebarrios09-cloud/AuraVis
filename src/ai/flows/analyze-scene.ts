'use server';

/**
 * @fileOverview An AI agent that analyzes a scene and provides an audio description.
 *
 * - analyzeScene - A function that handles the scene analysis process.
 * - AnalyzeSceneInput - The input type for the analyzeScene function.
 * - AnalyzeSceneOutput - The return type for the analyzeScene function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeSceneInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type AnalyzeSceneInput = z.infer<typeof AnalyzeSceneInputSchema>;

const AnalyzeSceneOutputSchema = z.object({
  sceneDescription: z.string().describe('A detailed description of the scene.'),
});
export type AnalyzeSceneOutput = z.infer<typeof AnalyzeSceneOutputSchema>;

export async function analyzeScene(input: AnalyzeSceneInput): Promise<AnalyzeSceneOutput> {
  return analyzeSceneFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeScenePrompt',
  input: {schema: AnalyzeSceneInputSchema},
  output: {schema: AnalyzeSceneOutputSchema},
  prompt: `You are an AI assistant that describes a scene in detail based on a provided image.

  Please provide a comprehensive description of the scene, including the objects present, the environment, and any notable details.

  Use the following image as the primary source of information about the scene:

  Image: {{media url=photoDataUri}}`,
});

const analyzeSceneFlow = ai.defineFlow(
  {
    name: 'analyzeSceneFlow',
    inputSchema: AnalyzeSceneInputSchema,
    outputSchema: AnalyzeSceneOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
