/**
 * Limita o tempo de espera de um pedido ao servidor. Sem isto, um pedido sem resposta deixa o ecrã
 * a processar indefinidamente, sem mensagem de erro.
 */
export function withTimeout<T>(request: PromiseLike<T>, ms: number, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tempo esgotado ao ${action}. Verifique a ligação à Internet e tente novamente.`)),
      ms,
    );
    Promise.resolve(request).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
