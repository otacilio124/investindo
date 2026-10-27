import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Se um componente de uma tela falhar, só aquela tela mostra o aviso; a
 * navegação e o resto do app continuam funcionando.
 */
export class BarreiraDeErro extends Component<{ children: ReactNode; chave?: string }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Tela com erro', erro, info.componentStack);
  }

  componentDidUpdate(anterior: { chave?: string }) {
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <main className="pagina">
        <div className="aviso aviso-erro pilha-curta" role="alert">
          <strong>Esta tela teve um problema.</strong>
          <span>Seus dados estão seguros. Tente abrir de novo.</span>
          <button className="botao botao-secundario" onClick={() => this.setState({ erro: null })}>Tentar de novo</button>
        </div>
      </main>
    );
  }
}
