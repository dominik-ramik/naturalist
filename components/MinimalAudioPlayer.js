export function MinimalAudioPlayer() {
  let audio = null;
  let isPlaying = false;
  let componentId = 'audio_' + Math.random().toString(36).substring(2, 11);

  return {
    view: function(vnode) {
      const { src } = vnode.attrs;
      
      return m('.minimal-audio-player', {
        style: {
          display: 'inline-block',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: '#e0e0e0',
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none'
        },
        onclick: function() {
          if (!audio) {
            audio = new Audio(src);
            audio.addEventListener('ended', function() {
              isPlaying = false;
              m.redraw();
            });
          }
          
          if (isPlaying) {
            audio.pause();
            isPlaying = false;
          } else {
            audio.play();
            isPlaying = true;
          }
          m.redraw();
        }
      }, [
        m('.play-button', {
          style: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '0',
            height: '0',
            borderStyle: 'solid',
            ...(isPlaying ? {
              // Pause icon (two rectangles)
              borderWidth: '0',
              width: '8px',
              height: '8px',
              background: 'linear-gradient(to right, #666 0%, #666 30%, transparent 30%, transparent 70%, #666 70%, #666 100%)'
            } : {
              // Play icon (triangle)
              borderWidth: '4px 0 4px 6px',
              borderColor: 'transparent transparent transparent #666',
              marginLeft: '1px'
            })
          }
        })
      ]);
    }
  };
}
