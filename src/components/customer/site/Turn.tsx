/**
 * One question and its answer in the visitor's box (no frame: the conversation the customer's chat
 * shows, without the customer's tools). The answer is plain text from the R-14 stub.
 */
export function Turn({question,answer}:{question:string;answer:string}){
  return <article className="chat-turn">
    <div className="question-row"><div className="question-bubble">{question}</div></div>
    <div className="answer-row">
      <div className="answer-content">
        {answer?<div className="answer-bubble"><p>{answer}</p></div>:<div className="typing" role="status">Looking it up<span>…</span></div>}
      </div>
    </div>
  </article>;
}
