/** The package ships no types; lib/audio.ts narrows the node it returns. */
declare module 'signalsmith-stretch' {
  const SignalsmithStretch: (context: BaseAudioContext) => Promise<AudioNode>;
  export default SignalsmithStretch;
}
