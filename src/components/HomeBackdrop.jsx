import { useTheme } from '../hooks.js';
import { litterAtlas } from '../lib/litter.js';
import Particles from './reactbits/Particles/Particles.jsx';

// Street litter drifting down behind the home headline: bottles, polythene bags, a crushed can,
// chai cups, a chips packet, banana peel, cardboard and a milk packet, small and faded so they sit
// in the background. They lean after the cursor or a finger (Particles listens on the window, so
// the backdrop itself can ignore taps), and pause off-screen, in background tabs and under
// reduced motion.
export default function HomeBackdrop() {
  const theme = useTheme();
  return (
    <div className={`home-backdrop home-backdrop-${theme}`} aria-hidden="true">
      <Particles
        shape="sprite"
        sprites={litterAtlas()}
        particleCount={70}
        particleSpread={2.6}
        cameraDistance={32}
        speed={0.05}
        drift="down"
        driftSpeed={0.3}
        particleBaseSize={720}
        sizeRandomness={0.7}
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
