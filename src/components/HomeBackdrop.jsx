import { useTheme } from '../hooks.js';
import Particles from './reactbits/Particles/Particles.jsx';

// Slow scraps of litter in the bin and brand colours, tumbling down behind the home headline.
// They lean after the cursor or a finger (Particles listens on the window, so the backdrop itself
// can ignore taps). It pauses itself off-screen, in background tabs and under reduced motion.
const SCRAPS = ['#1e5bc6', '#1b7a43', '#ffc20e', '#ff7a1a', '#e8336d'];

export default function HomeBackdrop() {
  const theme = useTheme();
  return (
    <div className="home-backdrop" aria-hidden="true">
      <Particles
        particleColors={SCRAPS}
        particleCount={90}
        particleSpread={2.6}
        cameraDistance={32}
        speed={0.05}
        shape="square"
        drift="down"
        driftSpeed={0.3}
        particleBaseSize={300}
        sizeRandomness={0.9}
        moveParticlesOnHover
        clickBurst={false}
        glow={0}
        twinkle={0}
        depthOfField={0}
        lightMode={theme === 'light'}
      />
    </div>
  );
}
