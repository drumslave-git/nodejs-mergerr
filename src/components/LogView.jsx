import React, { useEffect, useRef } from 'react';

function LogView({ title, logText, id }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logText]);

  return (
    <>
      <h2>{title}</h2>
      <pre id={id} className="log" ref={ref}>
        {logText}
      </pre>
    </>
  );
}

export default LogView;
