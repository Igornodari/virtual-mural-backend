import { ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';

/**
 * Regra única de autorização administrativa.
 *
 * Existe isolada do controller por dois motivos: dá para testar exaustivamente
 * sem HTTP, e a moderação de conteúdo e a fila de revisão da verificação de
 * morador vão precisar exatamente desta regra — reimplementá-la em cada lugar
 * é como as brechas aparecem.
 *
 * Dois papéis, com alcances deliberadamente diferentes:
 *
 * - **Administrador da plataforma** atravessa a fronteira do condomínio de
 *   propósito. Operar o produto exige enxergar o todo.
 * - **Síndico** NÃO fura a fronteira. Ele tem mais poder dentro do próprio
 *   condomínio, e nenhum poder fora dele.
 */
@Injectable()
export class AdminAuthorizationService {
  /** O usuário administra a plataforma inteira? */
  ehAdministradorDaPlataforma(user: User | null | undefined): boolean {
    return user?.isPlatformAdmin === true;
  }

  /**
   * O usuário pode administrar este condomínio?
   *
   * Ausência de dado NEGA: usuário nulo, condomínio nulo ou síndico sem
   * vínculo são todos recusados. Omissão nunca libera.
   */
  podeAdministrarCondominio(
    user: User | null | undefined,
    condominiumId: string | null | undefined,
  ): boolean {
    if (!user) return false;

    if (this.ehAdministradorDaPlataforma(user)) return true;

    if (!condominiumId || !user.condominiumId) return false;

    return user.isCondoManager === true && user.condominiumId === condominiumId;
  }

  /**
   * Mesma regra, lançando quando não autorizado.
   *
   * A mensagem distingue os dois casos porque a diferença importa para quem
   * está do outro lado: "você não é síndico" e "você é síndico de outro
   * prédio" pedem ações diferentes.
   */
  assertPodeAdministrarCondominio(
    user: User | null | undefined,
    condominiumId: string | null | undefined,
  ): void {
    if (this.podeAdministrarCondominio(user, condominiumId)) return;

    if (user?.isCondoManager) {
      throw new ForbiddenException(
        'Você só pode administrar o seu próprio condomínio.',
      );
    }

    throw new ForbiddenException(
      'Apenas o síndico do condomínio ou um administrador da plataforma podem ' +
        'realizar esta ação.',
    );
  }
}
