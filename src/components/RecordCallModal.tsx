import './RecordCallModal.css';

type RecordCallModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  onYes: () => void;
  onNo: () => void;
};

export function RecordCallModal({
  open,
  title = 'Record this call?',
  message = 'Choose whether to save a recording of this call on the server.',
  onYes,
  onNo,
}: RecordCallModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="record-modal-backdrop" role="presentation">
      <div className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
        <h3 id="record-modal-title">{title}</h3>
        <p>{message}</p>
        <div className="record-modal-actions">
          <button type="button" className="btn-record-yes" onClick={onYes}>
            Yes, record
          </button>
          <button type="button" className="btn-record-no" onClick={onNo}>
            No recording
          </button>
        </div>
      </div>
    </div>
  );
}
