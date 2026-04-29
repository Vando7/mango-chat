export const SettingsPanel = ({ serverUrl, setServerUrl, loading, error, connected, models, selectedModel, setSelectedModel, onConnect }) => (
  <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-3">
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConnect()}
          placeholder="http://localhost:13305"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <button
          onClick={onConnect}
          disabled={loading}
          className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
        >
          {loading ? '...' : 'Connect'}
        </button>
      </div>
      {connected && models.length > 0 && (
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  </div>
)
