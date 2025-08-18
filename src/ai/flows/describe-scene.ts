'use server';

/**
 * @fileOverview Describes the scene using AI by analyzing the camera view and providing an audio description.
 *
 * - describeScene - A function that handles the scene description process.
 * - DescribeSceneInput - The input type for the describeScene function.
 * - DescribeSceneOutput - The return type for the describeScene function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DescribeSceneInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  voice: z.enum(['male', 'female']).default('female').describe('The preferred voice for the audio description.'),
});
export type DescribeSceneInput = z.infer<typeof DescribeSceneInputSchema>;

const DescribeSceneOutputSchema = z.object({
  sceneDescription: z.string().describe('A detailed description of the scene, including identified objects and the overall context.'),
  ttsAudioDataUri: z.string().describe('The audio data URI containing the spoken description of the scene.'),
});
export type DescribeSceneOutput = z.infer<typeof DescribeSceneOutputSchema>;

export async function describeScene(input: DescribeSceneInput): Promise<DescribeSceneOutput> {
  return describeSceneFlow(input);
}

import wav from 'wav';

const describeSceneFlow = ai.defineFlow(
  {
    name: 'describeSceneFlow',
    inputSchema: DescribeSceneInputSchema,
    outputSchema: DescribeSceneOutputSchema,
  },
  async input => {
    const sceneAnalysisPrompt = ai.definePrompt({
      name: 'sceneAnalysisPrompt',
      input: {schema: z.object({photoDataUri: DescribeSceneInputSchema.shape.photoDataUri})},
      output: {schema: z.object({ sceneDescription: z.string().describe('Detailed textual description of the scene.')})},
      prompt: `You are an AI assistant that analyzes a camera view and provides a detailed description of the scene, including identified objects and the overall context.
      Analyze the following image and provide a description in the sceneDescription field.
      {{media url=photoDataUri}}
      `,
    });

    const {output} = await sceneAnalysisPrompt({ photoDataUri: input.photoDataUri });
    if (!output) {
      throw new Error('Could not generate scene description.');
    }
    const sceneDescription = output.sceneDescription;
    
    // Algenib is female-like, Achernar is male-like
    const voiceName = input.voice === 'male' ? 'Achernar' : 'Algenib';
    
    const ttsResult = await ai.generate({
      model: 'googleai/gemini-2.5-flash-preview-tts',
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {voiceName: voiceName},
          },
        },
      },
      prompt: sceneDescription,
    });

    if (!ttsResult.media) {
      throw new Error('No media returned from TTS API');
    }

    const audioBuffer = Buffer.from(
      ttsResult.media.url.substring(ttsResult.media.url.indexOf(',') + 1),
      'base64'
    );

    const ttsAudioDataUri = 'data:audio/wav;base64,' + (await toWav(audioBuffer));

    return {sceneDescription: sceneDescription, ttsAudioDataUri: ttsAudioDataUri};
  }
);

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}
