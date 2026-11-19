-- Exclusão administrativa explícita, sem apagar histórico de relatórios.
-- Vínculos de membros são detalhes do cadastro e usam ON DELETE CASCADE.
create function comprova.delete_managed_project(p_company_id uuid,p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_name text;
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem excluir projetos.' using errcode='42501';
  end if;

  -- Serializa com save_managed_project/set_member_projects, que bloqueiam a empresa.
  perform 1 from comprova.companies where id=p_company_id for update;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode='22023';
  end if;

  select p.name into v_project_name
    from comprova.projects p
   where p.company_id=p_company_id and p.id=p_project_id
   for update;
  if not found then
    raise exception 'Projeto não encontrado.' using errcode='22023';
  end if;

  if exists (select 1 from comprova.reports r where r.company_id=p_company_id and r.project_id=p_project_id) then
    raise exception 'Projeto com relatórios não pode ser excluído. Inative o projeto para preservar o histórico.' using errcode='23503';
  end if;

  delete from comprova.projects where company_id=p_company_id and id=p_project_id;
end;
$$;

revoke all on function comprova.delete_managed_project(uuid,uuid) from public,anon,authenticated;
grant execute on function comprova.delete_managed_project(uuid,uuid) to authenticated;
